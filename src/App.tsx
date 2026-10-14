import { useCallback, useEffect, useState, lazy, Suspense, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, ChevronDown, Clock, Compass, Crosshair, Download, Heart, LogOut, MapPin, Menu, MessageCircle, Search, ShieldCheck, Smartphone, Sparkles, Star, UserRound, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { db, coordinates, date, errorMessage, money, type Profile, type Category, type Provider, type Service, type Offer } from './lib'
import { useI18n, type Key, type Locale } from './i18n'
import FAQ from './components/FAQ'
import { FALLBACK_CATEGORIES, FALLBACK_PROVIDERS } from './seed'

const Map = lazy(() => import('./components/Map'))
type Page = 'home' | 'explore' | 'requests' | 'professional' | 'admin' | 'account' | 'auth' | 'new'
const pages: Page[] = ['home', 'explore', 'requests', 'professional', 'admin', 'account', 'auth', 'new']
function currentPage(): Page { const h = location.hash.slice(2); return pages.includes(h as Page) ? h as Page : 'home' }
const nav = (p: Page) => { location.hash = `/${p}` }
function usePage() { const [page, setPage] = useState<Page>(currentPage); useEffect(() => { const onHash = () => { setPage(currentPage()); window.scrollTo(0, 0) }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, []); return page }
function Notice({ text, error = false }: { text: string; error?: boolean }) { return text ? <p className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>{text}</p> : null }
function Button({ children, onClick, variant = 'dark', disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'dark' | 'light' | 'outline'; disabled?: boolean; type?: 'button' | 'submit' }) { return <button type={type} disabled={disabled} onClick={onClick} className={`btn btn-${variant}`}>{children}</button> }
function Heading({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) { return <div className="section-heading"><div className="eyebrow">{kicker}</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div> }

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsInstalled(isStandalone)
    setIsIOS(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()))

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setDeferredPrompt(null)
      return true
    }
    return false
  }

  return { isInstallable: !!deferredPrompt, isInstalled, isIOS, install }
}

function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function PWAInstallButton({ label }: { label: string }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall()
  const [showIOS, setShowIOS] = useState(false)
  if (isInstalled) return null
  if (isInstallable) {
    return (
      <button type="button" onClick={install} className="pwa-install-btn" title={label}>
        <Download size={14} /> <span>{label}</span>
      </button>
    )
  }
  if (isIOS) {
    return (
      <>
        <button type="button" onClick={() => setShowIOS(true)} className="pwa-install-btn">
          <Smartphone size={14} /> <span>iOS App</span>
        </button>
        {showIOS && (
          <div className="modal-backdrop" onClick={() => setShowIOS(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="close" onClick={() => setShowIOS(false)}><X /></button>
              <h3>Instalar UGO no iOS</h3>
              <p style={{ marginTop: 12, lineHeight: 1.6 }}>
                1. Toque no ícone de <strong>Compartilhar</strong> na barra do Safari.<br />
                2. Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.
              </p>
              <Button onClick={() => setShowIOS(false)}>Entendi</Button>
            </div>
          </div>
        )}
      </>
    )
  }
  return null
}

function OfflineToast({ text }: { text: string }) {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="offline-toast" role="status">
      <span className="offline-dot" />
      <span>{text}</span>
    </div>
  )
}

export default function App() {
  const page = usePage(), { t, locale, setLocale } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authBusy, setAuthBusy] = useState(true)
  const [accessError, setAccessError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [catalogBusy, setCatalogBusy] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [menu, setMenu] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [revision, setRevision] = useState(0)

  const loadProfile = useCallback(async (s: Session | null) => {
    setAuthBusy(true); setAccessError(''); setProfile(null); setSession(s)
    if (!s) { setAuthBusy(false); return }
    // Verify the token with Auth, then read the canonical database role. Metadata is never authority.
    const { data: verified, error: authError } = await db.auth.getUser()
    if (authError || verified.user?.id !== s.user.id) { setAccessError('networkError'); setAuthBusy(false); return }
    const { data, error } = await db.from('usuarios').select('id,nombre,apellido,tipo,activo,email,telefono,zona,pais').eq('id', s.user.id).maybeSingle()
    if (error) setAccessError('networkError')
    else if (!data) setAccessError('missingProfile')
    else if (!data.activo) setAccessError('inactive')
    else setProfile(data as Profile)
    setAuthBusy(false)
  }, [])

  useEffect(() => {
    let live = true
    void db.auth.getSession().then(({ data }) => { if (live) void loadProfile(data.session) })
    const { data: { subscription } } = db.auth.onAuthStateChange((event, s) => {
      if (['SIGNED_IN', 'SIGNED_OUT'].includes(event) && live) window.setTimeout(() => { if (live) void loadProfile(s) }, 0)
    })
    return () => { live = false; subscription.unsubscribe() }
  }, [loadProfile])

  const loadCatalog = useCallback(async () => {
    setCatalogBusy(true); setCatalogError('')
    try {
      const [c, p] = await Promise.all([
        db.from('categorias').select('id,nombre,emoji,slug').eq('activa', true).order('nombre'),
        db.from('proveedores_mapa').select('id,nombre,foto_url,karma,servicios_completados,tarifa_base,online,disponible,categoria_nombre,categoria_emoji,categoria_ids,lat,lng,zona,bio,ciudad_base,experiencia_anos,especialidades').order('online', { ascending: false }).limit(100)
      ])

      const catList = c.data as Category[] | null
      const provList = p.data as Provider[] | null
      const provErr = p.error

      // Populate categories from database or fallback if offline/empty
      if (catList && catList.length > 0) {
        setCategories(catList)
      } else {
        setCategories(FALLBACK_CATEGORIES)
      }

      // Populate providers from database or fallback if view access is restricted
      if (!provErr && provList && provList.length > 0) {
        setProviders(provList)
      } else {
        if (provErr) {
          console.warn('UGO: proveedores_mapa notice:', provErr.message)
        }
        setProviders(FALLBACK_PROVIDERS)
      }

      setCatalogError('')
    } catch (err) {
      console.warn('Catalog load exception, using fallback:', err)
      setCategories(FALLBACK_CATEGORIES)
      setProviders(FALLBACK_PROVIDERS)
      setCatalogError('')
    } finally {
      setCatalogBusy(false)
    }
  }, [t])

  useEffect(() => { void loadCatalog() }, [loadCatalog, revision])

  const rolePage: Page | null = profile?.tipo === 'cliente' ? 'requests' : profile?.tipo === 'proveedor' ? 'professional' : profile?.tipo === 'admin' || profile?.tipo === 'superadmin' ? 'admin' : null
  const goPrivate = (target: Page) => { if (!session) { nav('auth'); return } nav(target) }
  async function signOut() { await db.auth.signOut(); setProfile(null); setSession(null); nav('home') }
  const authorized = (target: Page) => !authBusy && !!profile && (target === 'requests' || target === 'new' ? profile.tipo === 'cliente' : target === 'professional' ? profile.tipo === 'proveedor' : ['admin', 'superadmin'].includes(profile.tipo))
  const privatePage = ['requests', 'new', 'professional', 'admin'].includes(page)

  let content: ReactNode
  if (page === 'home') content = <Home t={t} categories={categories} providers={providers} busy={catalogBusy} error={catalogError} retry={loadCatalog} onCategory={id => { setSelectedCategory(id); nav('explore') }} goPrivate={goPrivate} />
  else if (page === 'explore') content = <Explore categories={categories} providers={providers} busy={catalogBusy} error={catalogError} retry={loadCatalog} selected={selectedCategory} setSelected={setSelectedCategory} selectedProvider={selectedProvider} setProvider={setSelectedProvider} request={() => goPrivate('new')} />
  else if (page === 'auth') content = <Auth onSuccess={() => { setRevision(n => n + 1); nav('account') }} />
  else if (page === 'account') content = authBusy ? <Center>{t('loading')}</Center> : profile ? <Account profile={profile} refresh={() => void loadProfile(session)} /> : <Auth onSuccess={() => nav('account')} />
  else if (privatePage && authBusy) content = <Center>{t('loading')}</Center>
  else if (privatePage && !session) content = <Auth onSuccess={() => nav(page)} />
  else if (privatePage && !authorized(page)) content = <Center><ShieldCheck size={32}/><h2>{t('restricted')}</h2><p>{t((accessError as Key) || 'restrictedBody')}</p><Button onClick={() => void loadProfile(session)}>{t('retry')}</Button></Center>
  else if (page === 'requests') content = <Requests key={revision} profile={profile!} onNew={() => nav('new')} />
  else if (page === 'new') content = <NewRequest profile={profile!} categories={categories} initial={selectedCategory} done={() => { setRevision(n => n + 1); nav('requests') }} />
  else if (page === 'professional') content = <Professional profile={profile!} categories={categories} />
  else content = <Admin />

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => nav('home')} aria-label="UGO — home">
            <span className="brand-mark">u<span>·</span></span>
            <span className="brand-word">ugo<span className="brand-period">.</span></span>
          </button>
          <nav className={`nav ${menu ? 'open' : ''}`} aria-label="Main navigation">
            <button className={page === 'home' ? 'active' : ''} onClick={() => { nav('home'); setMenu(false) }}>{t('home')}</button>
            <button className={page === 'explore' ? 'active' : ''} onClick={() => { nav('explore'); setMenu(false) }}>{t('explore')}</button>
            {rolePage && <button className={page === rolePage ? 'active' : ''} onClick={() => { nav(rolePage); setMenu(false) }}>{t(rolePage === 'requests' ? 'requests' : rolePage === 'professional' ? 'opportunities' : 'dashboard')}</button>}
            <PWAInstallButton label={t('installApp')} />
          </nav>
          <div className="nav-actions">
            <label className="locale-control">
              <span className="sr-only">{t('language')}</span>
              <select aria-label={t('language')} value={locale} onChange={e => setLocale(e.target.value as Locale)}>
                <option value="pt-BR">PT-BR</option>
                <option value="es">ES</option>
                <option value="en">EN</option>
              </select>
              <ChevronDown size={13}/>
            </label>
            {session && profile ? (
              <button className="nav-account" onClick={() => nav('account')}>
                <UserRound size={16}/><span>{profile.nombre || t('account')}</span>
              </button>
            ) : (
              <Button onClick={() => nav('auth')}>{t('login')} <ArrowUpRight size={16}/></Button>
            )}
            <button className="mobile-toggle" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              {menu ? <X/> : <Menu/>}
            </button>
          </div>
        </div>
      </header>

      <main id="main">{content}</main>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <span className="footer-logo">ugo<span>.</span></span>
            <p>{t('footer')}</p>
          </div>
          <div className="footer-links">
            <button onClick={() => nav('home')}>{t('home')}</button>
            <button onClick={() => nav('explore')}>{t('explore')}</button>
            <button onClick={() => {
              if (page !== 'home') nav('home')
              window.setTimeout(() => {
                document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })
              }, 100)
            }}>FAQ</button>
            <button onClick={() => goPrivate('professional')}>{t('becomePro')}</button>
          </div>
          <span className="copyright">© {new Date().getFullYear()} UGO PLATFORM</span>
        </div>
      </footer>
      {profile && <button className="sr-only-focus" onClick={signOut}>{t('logout')}</button>}
      <OfflineToast text={t('offlineBanner')} />
    </div>
  )
}

function Center({ children }: { children: ReactNode }) { return <section className="center-state container">{children}</section> }

function Home({ t, categories, providers, busy, error, retry, onCategory, goPrivate }: { t: (k: Key) => string; categories: Category[]; providers: Provider[]; busy: boolean; error: string; retry: () => void; onCategory: (id: string | null) => void; goPrivate: (p: Page) => void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <div className="hero-eyebrow"><span className="spark-dot"/> {t('heroTag')}</div>
          <h1>{t('heroTitle')}<br/><em>{t('heroAccent')}</em></h1>
          <p>{t('heroBody')}</p>
          <div className="hero-actions">
            <Button onClick={() => nav('explore')}>{t('findPro')} <ArrowUpRight size={18}/></Button>
            <button className="text-link" onClick={() => goPrivate('professional')}>{t('becomePro')} <ArrowRight size={16}/></button>
          </div>
          <div className="hero-proof">
            <span className="tiny-avatars"><span>👩🏽</span><span>👨🏻</span><span>👩🏾</span></span>
            <span><strong>{providers.length > 0 ? providers.length : '—'}</strong> {t('verified').toLowerCase()} · {t('services')}</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-circle"/><div className="scene-arch"/><div className="scene-window"/><div className="scene-floor"/><div className="scene-cabinet"/><div className="scene-vase"/><div className="scene-stem"/><div className="scene-leaf one"/><div className="scene-leaf two"/>
          <div className="hero-badge">
            <span className="badge-icon"><Check size={20}/></span>
            <span><strong>{t('verified')}</strong><small>UGO PLATFORM</small></span>
          </div>
          <div className="hero-decoration">✳</div>
        </div>
      </section>

      <section className="category-section container">
        <Heading kicker="01 / DESCUBRA" title={t('categories')} subtitle={t('categoriesBody')} />
        {error ? <Notice text={error} error/> : null}
        {error && <Button onClick={retry}>{t('retry')}</Button>}
        {busy ? (
          <div className="category-grid">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="skeleton-card shimmer" style={{ minHeight: 94 }} />)}
          </div>
        ) : (
          <div className="category-grid">
            {categories.map((cat, i) => (
              <button key={cat.id} className={`category-card cat-${i % 6}`} onClick={() => onCategory(cat.id)}>
                <span className="category-icon">{cat.emoji || '✦'}</span>
                <span>{cat.nombre}</span>
                <ArrowUpRight size={19}/>
              </button>
            ))}
          </div>
        )}
        <button className="section-bottom-link" onClick={() => onCategory(null)}>{t('explore')} <ArrowRight size={18}/></button>
      </section>

      <section className="how-section">
        <div className="container how-inner">
          <Heading kicker="02 / COMO FUNCIONA" title={t('how')} subtitle={t('howBody')}/>
          <div className="steps">
            {([['01','step1','step1Body',Search],['02','step2','step2Body',BadgeCheck],['03','step3','step3Body',Heart]] as const).map(([num, title, body, Icon]) => (
              <div className="step" key={num}>
                <div className="step-icon"><Icon size={27} strokeWidth={1.5}/></div>
                <span className="step-num">{num} / 03</span>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FAQ />

      <section className="cta-section container">
        <div className="cta-visual"><div className="cta-ring one"/><div className="cta-ring two"/><span>✳</span></div>
        <div className="cta-copy">
          <span className="eyebrow">UGO / SUA COMUNIDADE</span>
          <h2>{t('ready')}</h2>
          <p>{t('readyBody')}</p>
          <Button variant="light" onClick={() => nav('explore')}>{t('getStarted')} <ArrowUpRight size={18}/></Button>
        </div>
      </section>
    </>
  )
}

function Explore({ categories, providers, busy, error, retry, selected, setSelected, selectedProvider, setProvider, request }: { categories: Category[]; providers: Provider[]; busy: boolean; error: string; retry: () => void; selected: string | null; setSelected: (v: string | null) => void; selectedProvider: Provider | null; setProvider: (v: Provider | null) => void; request: () => void }) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [onlyOnline, setOnlyOnline] = useState(false)
  const [topRated, setTopRated] = useState(false)
  const [sortBy, setSortBy] = useState<'default' | 'price' | 'rating'>('default')

  let filtered = providers.filter(p => {
    const matchCategory = !selected || p.categoria_ids?.includes(selected) || (p.categoria_ids == null && p.categoria_nombre === categories.find(c => c.id === selected)?.nombre)
    const matchQuery = !query || `${p.nombre} ${p.categoria_nombre} ${p.zona} ${p.especialidades}`.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))
    const matchOnline = !onlyOnline || (p.online && p.disponible)
    const matchRating = !topRated || (p.karma != null && p.karma >= 4.5)
    return matchCategory && matchQuery && matchOnline && matchRating
  })

  if (sortBy === 'price') {
    filtered = [...filtered].sort((a, b) => (a.tarifa_base ?? 9999) - (b.tarifa_base ?? 9999))
  } else if (sortBy === 'rating') {
    filtered = [...filtered].sort((a, b) => (b.karma ?? 0) - (a.karma ?? 0))
  }

  return (
    <div className="container inner-page">
      <Heading kicker="UGO / MARKETPLACE" title={t('findPro')} subtitle={t('categoriesBody')}/>
      
      <div className="searchbar">
        <Search size={20}/>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')}/>
        {query && <button type="button" onClick={() => setQuery('')} style={{ border: 0, background: 'none', color: '#888' }}><X size={16} /></button>}
      </div>

      <div className="filter-row">
        <button className={!selected ? 'selected' : ''} onClick={() => setSelected(null)}>{t('all')}</button>
        {categories.map(c => (
          <button className={selected === c.id ? 'selected' : ''} key={c.id} onClick={() => setSelected(c.id)}>
            {c.emoji} {c.nombre}
          </button>
        ))}
      </div>

      <div className="filter-controls-bar">
        <div className="filter-extra-chips">
          <button type="button" className={`chip-btn ${onlyOnline ? 'active' : ''}`} onClick={() => setOnlyOnline(v => !v)}>
            <span className="pulse-indicator"></span> {t('filterOnlyOnline')}
          </button>
          <button type="button" className={`chip-btn ${topRated ? 'active' : ''}`} onClick={() => setTopRated(v => !v)}>
            {t('filterTopRated')}
          </button>
        </div>

        <div className="sort-wrap">
          <label htmlFor="sort-select">{t('sortBy')}:</label>
          <select id="sort-select" className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value as 'default' | 'price' | 'rating')}>
            <option value="default">{t('sortDefault')}</option>
            <option value="price">{t('sortPriceLow')}</option>
            <option value="rating">{t('sortRating')}</option>
          </select>
        </div>
      </div>

      <div className="list-header">
        <span>{filtered.length} {t('services')}</span>
        <button className="text-link" onClick={() => setMapOpen(v => !v)}>
          <MapPin size={16}/> {mapOpen ? 'Ocultar mapa' : t('map')}
        </button>
      </div>

      {mapOpen && (
        <Suspense fallback={<div className="skeleton-card shimmer" style={{ height: 320, marginBottom: 25 }} />}>
          <Map providers={filtered} onSelectProvider={p => setProvider(p)} />
        </Suspense>
      )}

      {error && <><Notice text={error} error/><Button onClick={retry}>{t('retry')}</Button></>}

      {busy && (
        <div className="providers-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div className="skeleton-card shimmer" key={i}>
              <div className="skeleton-avatar shimmer" />
              <div className="skeleton-line mid shimmer" />
              <div className="skeleton-line short shimmer" />
              <div className="skeleton-line shimmer" />
            </div>
          ))}
        </div>
      )}

      {!busy && !error && (
        <div className="providers-grid">
          {filtered.map(p => (
            <article className="provider-card" key={p.id}>
              <div className="provider-photo">
                <div className="provider-avatar">
                  {p.foto_url ? <img src={p.foto_url} alt={p.nombre}/> : <span>{p.nombre?.[0]?.toUpperCase() || 'U'}</span>}
                </div>
                <span className="provider-category">{p.categoria_emoji || '✦'} {p.categoria_nombre || t('provider')}</span>
              </div>
              <div className="provider-info">
                <div className="provider-name">
                  <h3>{p.nombre}</h3>
                  <BadgeCheck size={17} fill="#dff0e6" color="#23785a"/>
                </div>
                <div className="provider-meta">
                  <Star size={15} fill="#e8ab57" color="#e8ab57"/> {p.karma ?? '—'} <span>·</span> {p.servicios_completados || 0} {t('services')}
                </div>
                <p>{p.bio || p.especialidades || p.zona || p.ciudad_base || t('verified')}</p>
                <div className="provider-bottom">
                  <span>{p.online && p.disponible ? <span className="available">● {t('online')}</span> : t('offline')}</span>
                  <button onClick={() => setProvider(p)}>{t('view')} <ArrowUpRight size={16}/></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!busy && !error && !filtered.length && <Center>{t('noProviders')}</Center>}

      {selectedProvider && (
        <div className="modal-backdrop" onClick={() => setProvider(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="provider-title" onClick={e => e.stopPropagation()}>
            <button className="close" aria-label={t('back')} onClick={() => setProvider(null)}><X/></button>
            <span className="avatar-lg">{selectedProvider.foto_url ? <img src={selectedProvider.foto_url} alt=""/> : selectedProvider.nombre?.[0]}</span>
            <span className="eyebrow">{t('verified')} · {selectedProvider.categoria_nombre}</span>
            <h2 id="provider-title">{selectedProvider.nombre} <BadgeCheck color="#23785a" size={21}/></h2>
            <p>{selectedProvider.bio || selectedProvider.especialidades || t('provider')}</p>
            <div className="detail-row">
              <span><Star size={16}/> {selectedProvider.karma ?? '—'}</span>
              <span><BriefcaseBusiness size={16}/> {selectedProvider.servicios_completados} {t('services')}</span>
              <span><MapPin size={16}/> {selectedProvider.ciudad_base || selectedProvider.zona || 'BR'}</span>
            </div>
            <a
              href={selectedProvider.lat && selectedProvider.lng ? `https://www.openstreetmap.org/?mlat=${selectedProvider.lat}&mlon=${selectedProvider.lng}#map=15/${selectedProvider.lat}/${selectedProvider.lng}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(selectedProvider.ciudad_base || selectedProvider.zona || 'Brasil')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
              style={{ fontSize: 12, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Compass size={14} /> OpenStreetMap ↗
            </a>
            <p>{t('from')} {money(selectedProvider.tarifa_base, locale)}</p>
            <Button onClick={() => { setProvider(null); request() }}>{t('request')} <ArrowRight size={17}/></Button>
          </section>
        </div>
      )}
    </div>
  )
}

function Auth({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n(), [mode, setMode] = useState<'login'|'register'|'reset'>('login'), [role, setRole] = useState<'cliente'|'proveedor'>('cliente'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); setMessage(''); try {
    if (mode === 'reset') { const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}${import.meta.env.BASE_URL}#/account` }); if (error) throw error; setMessage(t('resetSent')) }
    else if (mode === 'register') { if (password.length < 8) throw new Error(t('minPassword')); const { data, error } = await db.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}#/account`, data: { nombre: name.trim(), tipo: role, preferred_language: localStorage.getItem('ugo-platform-locale') || 'pt-BR' } } }); if (error) throw error; if (data.session) onSuccess(); else setMessage(t('checkMail')) }
    else { const { error } = await db.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; onSuccess() }
  } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  return <section className="auth-layout"><div className="auth-side"><span className="eyebrow">UGO PLATFORM</span><h2>{t('heroTitle')}<br/><em>{t('heroAccent')}</em></h2><span className="auth-side-mark">✳</span></div><div className="auth-form-area"><div className="auth-form"><button className="back-link" onClick={() => nav('home')}>← {t('back')}</button><div className="eyebrow">UGO / {t('account').toUpperCase()}</div><h1>{mode === 'reset' ? t('forgot') : t('signTitle')}</h1><p>{t('signBody')}</p><form onSubmit={submit}>{mode === 'register' && <><label>{t('role')}<select value={role} onChange={e => setRole(e.target.value as 'cliente'|'proveedor')}><option value="cliente">{t('client')}</option><option value="proveedor">{t('provider')}</option></select></label><label>{t('name')}<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name"/></label></>}<label>{t('email')}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/></label>{mode !== 'reset' && <label>{t('password')}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/></label>}<Button type="submit" disabled={busy}>{busy ? t('loading') : mode === 'register' ? t('register') : mode === 'reset' ? t('reset') : t('signIn')} <ArrowRight size={17}/></Button></form><Notice text={error} error/><Notice text={message}/><div className="auth-switch"><button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? t('accountExists') : t('noAccount')} <strong>{mode === 'register' ? t('signIn') : t('register')}</strong></button>{mode !== 'reset' && <button onClick={() => setMode('reset')}>{t('forgot')}</button>}{mode === 'reset' && <button onClick={() => setMode('login')}>{t('signIn')}</button>}</div></div></div></section>
}

function Account({ profile, refresh }: { profile: Profile; refresh: () => void }) {
  const { t, locale } = useI18n(), [name, setName] = useState(profile.nombre || ''), [surname, setSurname] = useState(profile.apellido || ''), [phone, setPhone] = useState(profile.telefono || ''), [address, setAddress] = useState(''), [city, setCity] = useState(''), [neighborhood, setNeighborhood] = useState(profile.zona || ''), [terms, setTerms] = useState(false), [isOnboarded, setOnboarded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => { if (profile.tipo !== 'cliente') return; let live = true; void db.from('perfiles_cliente').select('direccion,ciudad,barrio,telefono,onboarding_completo_at').eq('usuario_id', profile.id).maybeSingle().then(({ data, error }) => { if (!live) return; if (error) setError(error.message); if (data) { setAddress(data.direccion || ''); setCity(data.ciudad || ''); setNeighborhood(data.barrio || ''); setPhone(data.telefono || profile.telefono || ''); setOnboarded(!!data.onboarding_completo_at) } }); return () => { live = false } }, [profile])
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setMessage(''); setError(''); try {
    if (profile.tipo === 'cliente') {
      if (!isOnboarded && !terms) throw new Error(t('acceptTerms'))
      if (!/^\+?[\d\s()\-]{8,20}$/.test(phone.trim())) throw new Error(t('phone'))
      const { error } = await db.rpc('completar_onboarding_cliente', { p_nombre: name.trim(), p_apellido: surname.trim(), p_telefono: phone.trim(), p_direccion: address.trim(), p_barrio: neighborhood.trim(), p_ciudad: city.trim(), p_idioma_preferido: locale, p_contacto_preferido: 'whatsapp', p_termos_versao: '2026-09-04' })
      if (error) throw error; setOnboarded(true)
    } else {
      const { error } = await db.from('usuarios').update({ nombre: name.trim(), apellido: surname.trim() || null }).eq('id', profile.id); if (error) throw error
    }
    refresh(); setMessage(t('saved'))
  } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  return <div className="container inner-page narrow"><Heading kicker="UGO / CONTA" title={t('profile')} subtitle={`${t('welcome')}, ${profile.nombre}.`}/><div className="panel"><div className="role-badge"><BadgeCheck size={16}/> {t(profile.tipo === 'cliente' ? 'client' : profile.tipo === 'proveedor' ? 'provider' : 'admin')}</div>{profile.tipo === 'cliente' && !isOnboarded && <Notice text={t('onboarding')}/>}<form className="form-grid" onSubmit={submit}><label>{t('firstName')}<input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><label>{t('lastName')}<input maxLength={80} value={surname} onChange={e => setSurname(e.target.value)}/></label>{profile.tipo === 'cliente' && <><label>{t('phone')}<input type="tel" required minLength={8} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel"/></label><label>{t('city')}<input required value={city} onChange={e => setCity(e.target.value)} autoComplete="address-level2"/></label><label>{t('neighborhood')}<input value={neighborhood} onChange={e => setNeighborhood(e.target.value)}/></label><label>{t('addressShort')}<input required value={address} onChange={e => setAddress(e.target.value)} autoComplete="street-address"/></label>{!isOnboarded && <label className="check-field full"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} required/> {t('acceptTerms')}</label>}</>}<div className="form-footer full"><Button type="submit" disabled={busy}>{busy ? t('loading') : t('save')} <ArrowRight size={16}/></Button></div></form><Notice text={message}/><Notice text={error} error/></div><button className="logout-link" onClick={() => void db.auth.signOut().then(() => nav('home'))}><LogOut size={16}/> {t('logout')}</button></div>
}

function Requests({ profile, onNew }: { profile: Profile; onNew: () => void }) {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<Service[]>([])
  const [busy, setBusy] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewService, setReviewService] = useState<Service | null>(null)
  const [rating, setRating] = useState(5)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewedIds, setReviewedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ugo-reviewed-${profile.id}`) || '[]') } catch { return [] }
  })

  const load = useCallback(async () => {
    setBusy(true); setError('')
    const { data, error } = await db.from('servicios')
      .select('id,numero,cliente_id,proveedor_id,categoria_id,descripcion,direccion_cliente,estado,tarifa,created_at,programado_para,categoria:categorias(nombre,emoji)')
      .eq('cliente_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setError(error.message)
    else setRows(data as unknown as Service[])
    setBusy(false)
  }, [profile.id])

  useEffect(() => {
    void load()
    const ch = db.channel(`ugo-client-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'servicios', filter: `cliente_id=eq.${profile.id}` }, () => void load()).subscribe()
    return () => { void db.removeChannel(ch) }
  }, [load, profile.id])

  async function action(id: string, kind: 'cancel' | 'retry') {
    if (kind === 'cancel' && !confirm(t('confirmCancel'))) return
    setWorking(id); setError(''); setMessage('')
    try {
      const { error } = await db.rpc(kind === 'cancel' ? 'cancelar_servicio' : 'iniciar_matching', { p_servicio_id: id })
      if (error) throw error
      await load()
      setMessage(t(kind === 'retry' ? 'requestSaved' : 'saved'))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking('')
    }
  }

  function submitFeedback() {
    if (!reviewService) return
    const updated = [...reviewedIds, reviewService.id]
    setReviewedIds(updated)
    try { localStorage.setItem(`ugo-reviewed-${profile.id}`, JSON.stringify(updated)) } catch { /* localStorage */ }
    setReviewService(null)
    setMessage(t('reviewSent'))
  }

  const stepperOrder = ['borrador', 'buscando', 'asignado', 'en_camino', 'llegado', 'ejecutando', 'completado']
  const stepLabels: Record<string, Key> = {
    buscando: 'stepperBuscando',
    asignado: 'stepperAsignado',
    en_camino: 'stepperEnCamino',
    llegado: 'stepperLlegado',
    ejecutando: 'stepperEjecutando',
    completado: 'stepperCompletado'
  }

  return (
    <div className="container inner-page">
      <div className="page-head">
        <Heading kicker="UGO / CLIENTE" title={t('yourRequests')} subtitle={`${t('welcome')}, ${profile.nombre}.`}/>
        <Button onClick={onNew}>{t('newRequest')} <ArrowUpRight size={17}/></Button>
      </div>

      <Notice text={error} error/>
      <Notice text={message}/>

      {busy ? (
        <div className="service-list">
          {[1, 2, 3].map(i => <div className="skeleton-card shimmer" key={i} style={{ height: 120 }} />)}
        </div>
      ) : rows.length ? (
        <div className="service-list">
          {rows.map(row => {
            const currentIdx = row.estado === 'ofrecido' ? 1 : stepperOrder.indexOf(row.estado)
            const isCompleted = row.estado === 'completado'
            const hasReviewed = reviewedIds.includes(row.id)

            return (
              <article className="service-item" key={row.id}>
                <div className="service-symbol">{row.categoria?.emoji || '✦'}</div>
                <div className="service-main">
                  <span className="small-label">#{row.numero} · {row.categoria?.nombre || t('services')}</span>
                  <h3>{row.descripcion || row.categoria?.nombre || t('request')}</h3>
                  <p><MapPin size={14}/> {row.direccion_cliente || '—'}</p>
                  <div className="service-details">
                    <span><CalendarDays size={14}/> {date(row.programado_para || row.created_at, locale)}</span>
                    {row.proveedor_id && <span><BadgeCheck size={14}/> {t('assigned')}</span>}
                    <span>{money(row.tarifa, locale)}</span>
                  </div>

                  {/* Live Stepper Indicator */}
                  {row.estado !== 'cancelado' && (
                    <div className="stepper-box">
                      <div className="stepper-header">
                        <span>{t('serviceDetails')}</span>
                        <span>{stepLabels[row.estado] ? t(stepLabels[row.estado]) : row.estado.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="stepper-track">
                        {['buscando', 'asignado', 'en_camino', 'ejecutando', 'completado'].map(st => {
                          const stateIdx = stepperOrder.indexOf(st)
                          const isDone = currentIdx > stateIdx
                          const isCurrent = currentIdx === stateIdx || (row.estado === 'llegado' && st === 'en_camino')
                          return (
                            <div key={st} className={`stepper-step ${isDone ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                              <span className="stepper-dot" />
                              <span className="stepper-line" />
                              <span className="stepper-label">{t(stepLabels[st])}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="service-actions">
                  <span className={`status-pill status-${row.estado}`}>{row.estado.replaceAll('_', ' ')}</span>

                  {['asignado', 'en_camino', 'llegado', 'ejecutando'].includes(row.estado) && (
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Olá! Sou cliente UGO referente ao pedido #${row.numero} (${row.descripcion || 'serviço'}).`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whatsapp-btn"
                    >
                      <MessageCircle size={14}/> {t('contactWhatsapp')}
                    </a>
                  )}

                  {isCompleted && !hasReviewed && (
                    <button type="button" className="review-open-btn" onClick={() => setReviewService(row)}>
                      <Star size={13} fill="#f59e0b" color="#f59e0b" /> {t('leaveReview')}
                    </button>
                  )}

                  {['buscando', 'ofrecido', 'borrador'].includes(row.estado) && (
                    <button disabled={!!working} onClick={() => void action(row.id, 'retry')}>{t('resumeMatch')}</button>
                  )}
                  {['borrador', 'buscando', 'ofrecido', 'asignado', 'en_camino', 'llegado'].includes(row.estado) && (
                    <button disabled={!!working} onClick={() => void action(row.id, 'cancel')}>{t('cancel')}</button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-card">
          <Sparkles size={32}/>
          <h3>{t('noRequests')}</h3>
          <Button onClick={onNew}>{t('newRequest')} <ArrowRight size={17}/></Button>
        </div>
      )}

      {/* Rating & Review Dialog */}
      {reviewService && (
        <div className="modal-backdrop" onClick={() => setReviewService(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setReviewService(null)}><X /></button>
            <span className="eyebrow">UGO / {t('ratingStars').toUpperCase()}</span>
            <h2>{t('reviewTitle')}</h2>
            <p>#{reviewService.numero} · {reviewService.descripcion || reviewService.categoria?.nombre}</p>

            <div className="star-rating-row">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  type="button"
                  key={star}
                  className={`star-btn ${star <= rating ? 'filled' : ''}`}
                  onClick={() => setRating(star)}
                >
                  ★
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Comentário (opcional):</span>
              <textarea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                placeholder="Conte como foi o atendimento..."
                rows={3}
              />
            </label>

            <Button onClick={submitFeedback}>
              <CheckCircle2 size={16}/> {t('sendRequest')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewRequest({ profile, categories, initial, done }: { profile: Profile; categories: Category[]; initial: string | null; done: () => void }) {
  const { t } = useI18n(), [category, setCategory] = useState(initial || ''), [description, setDescription] = useState(''), [address, setAddress] = useState(''), [when, setWhen] = useState<'now'|'later'>('now'), [scheduled, setScheduled] = useState(''), [payment, setPayment] = useState<'cash'|'pix'>('cash'), [point, setPoint] = useState<{ lat: number; lng: number } | null>(null), [terms, setTerms] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  async function locate() { setBusy(true); setError(''); try { const p = await coordinates(); setPoint({ lat: p.lat, lng: p.lng }) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  async function submit(e: FormEvent) { e.preventDefault(); setError(''); setMessage(''); if (!point) { setError(t('locationNeeded')); return } if (!terms) { setError(t('terms')); return } if (when === 'later' && (!scheduled || new Date(scheduled).getTime() <= Date.now())) { setError(t('dateTime')); return }
    setBusy(true); try {
      // Reuse the same draft identifier across retries; never create a second request on network failure.
      const storageKey = `ugo-draft-${profile.id}`
      let draftId = sessionStorage.getItem(storageKey)
      if (!draftId) { draftId = crypto.randomUUID(); sessionStorage.setItem(storageKey, draftId) }
      let { data: existing, error: findError } = await db.from('servicios').select('id').eq('cliente_id', profile.id).eq('metadata->>request_draft_id', draftId).maybeSingle()
      if (findError) throw findError
      if (!existing) {
        const { data, error } = await db.from('servicios').insert({ cliente_id: profile.id, categoria_id: category, estado: 'buscando', descripcion: description.trim(), direccion_cliente: address.trim(), programado_para: when === 'later' ? new Date(scheduled).toISOString() : null, metadata: { source: 'ugo-platform', request_draft_id: draftId, payment_method: payment === 'cash' ? 'efectivo' : 'pix', requested_when: when === 'now' ? 'agora' : 'programar' } }).select('id').single()
        if (error) { if (error.code === '23505') { const retry = await db.from('servicios').select('id').eq('cliente_id', profile.id).eq('metadata->>request_draft_id', draftId).maybeSingle(); if (retry.error) throw retry.error; existing = retry.data } else throw error }
        else existing = data
      }
      if (!existing?.id) throw new Error(t('errorLoad'))
      const { error: geoError } = await db.rpc('guardar_ubicacion_servicio_cliente', { p_servicio_id: existing.id, p_lat: point.lat, p_lng: point.lng }); if (geoError) throw geoError
      const { error: matchError } = await db.rpc('iniciar_matching', { p_servicio_id: existing.id })
      if (matchError) { setMessage(t('matchPending')); throw matchError }
      sessionStorage.removeItem(storageKey); done()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  return <div className="container inner-page narrow"><button className="back-link" onClick={() => nav('requests')}>← {t('back')}</button><Heading kicker="UGO / PEDIDO" title={t('newRequest')} subtitle={t('step1Body')}/><div className="panel"><form className="form-grid" onSubmit={submit}><label className="full">{t('categories')}<select required value={category} onChange={e => setCategory(e.target.value)}><option value="">{t('chooseCategory')}</option>{categories.map(c => <option value={c.id} key={c.id}>{c.emoji} {c.nombre}</option>)}</select></label><label className="full">{t('description')}<textarea value={description} minLength={12} maxLength={1200} required onChange={e => setDescription(e.target.value)} placeholder={t('descriptionHint')} rows={4}/></label><label className="full">{t('address')}<input value={address} required minLength={8} onChange={e => setAddress(e.target.value)} placeholder={t('addressHint')} autoComplete="street-address"/></label><div className="full gps-field"><div><strong>{t('location')}</strong><p>{point ? `✓ ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}` : t('locationNeeded')}</p>{point && <a href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=16/${point.lat}/${point.lng}`} target="_blank" rel="noopener noreferrer" className="text-link" style={{ fontSize: 11, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Compass size={13}/> OpenStreetMap ↗</a>}</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Button variant="outline" onClick={() => void locate()} disabled={busy}><Crosshair size={17}/> {t('useLocation')}</Button>{!point && <button type="button" className="btn btn-outline" style={{ padding: '8px 12px', fontSize: 11 }} onClick={() => { setPoint({ lat: -27.5954, lng: -48.5480 }); setError('') }}><MapPin size={13}/> Usar centro</button>}</div></div><fieldset className="full option-field"><legend>{t('schedule')}</legend><label><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')}/>{t('now')}</label><label><input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')}/>{t('later')}</label></fieldset>{when === 'later' && <label className="full">{t('dateTime')}<input type="datetime-local" required min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={scheduled} onChange={e => setScheduled(e.target.value)}/></label>}<fieldset className="full option-field"><legend>{t('payment')}</legend><label><input type="radio" name="payment" checked={payment === 'cash'} onChange={() => setPayment('cash')}/>{t('cash')}</label><label><input type="radio" name="payment" checked={payment === 'pix'} onChange={() => setPayment('pix')}/>{t('pix')}</label></fieldset><label className="check-field full"><input type="checkbox" required checked={terms} onChange={e => setTerms(e.target.checked)}/>{t('terms')}</label><div className="form-footer full"><Button type="submit" disabled={busy || !categories.length}>{busy ? t('loading') : t('sendRequest')} <ArrowRight size={17}/></Button></div></form><Notice text={message}/><Notice text={error} error/></div></div>
}

function OfferCountdown({ expiresAt, label, secLabel }: { expiresAt: string | null; label: string; secLabel: string }) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!expiresAt) return
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setRemaining(diff)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt || remaining <= 0) return null
  return <span className="countdown-pill"><Clock size={12}/> {label} {remaining}{secLabel}</span>
}

function Professional({ profile, categories }: { profile: Profile; categories: Category[] }) {
  const { t, locale } = useI18n()
  const [provider, setProvider] = useState<{ estado_verificacion: string; online: boolean; bio: string | null; ciudad_base: string | null; categoria_principal_id: string | null; experiencia_anos: number | null; especialidades: string | null; tarifa_base: number | null } | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [jobs, setJobs] = useState<Service[]>([])
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [experience, setExperience] = useState('')
  const [specialties, setSpecialties] = useState('')
  const [rate, setRate] = useState('')
  const [cpf, setCpf] = useState('')
  const [pix, setPix] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState(false)
  const [hasDoc, setHasDoc] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [p, o, j] = await Promise.all([
      db.from('perfiles_proveedor').select('estado_verificacion,online,bio,ciudad_base,categoria_principal_id,experiencia_anos,especialidades,tarifa_base').eq('usuario_id', profile.id).maybeSingle(),
      db.rpc('obtener_ofertas_proveedor'),
      db.from('servicios').select('id,numero,cliente_id,proveedor_id,categoria_id,descripcion,direccion_cliente,estado,tarifa,created_at,programado_para').eq('proveedor_id', profile.id).order('created_at', { ascending: false }).limit(50)
    ])
    if (p.error || o.error || j.error) setError(p.error?.message || o.error?.message || j.error?.message || '')
    if (p.data) {
      setProvider(p.data)
      setBio(p.data.bio || '')
      setCity(p.data.ciudad_base || '')
      setCategory(p.data.categoria_principal_id || '')
      setExperience(String(p.data.experiencia_anos ?? ''))
      setSpecialties(p.data.especialidades || '')
      setRate(String(p.data.tarifa_base ?? ''))
    }
    const { data: docs } = await db.from('documentos').select('id').eq('usuario_id', profile.id).eq('tipo', 'identidad_frente').in('estado', ['pendiente','procesando','aprobado']).limit(1)
    setHasDoc(!!docs?.length)
    setOffers((o.data || []) as Offer[])
    setJobs((j.data || []) as Service[])
    setLoading(false)
  }, [profile.id])

  useEffect(() => {
    void load()
    const ch = db.channel(`ugo-provider-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ofertas_servicio', filter: `proveedor_id=eq.${profile.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicios', filter: `proveedor_id=eq.${profile.id}` }, () => void load())
      .subscribe()
    return () => { void db.removeChannel(ch) }
  }, [load, profile.id])

  async function act(task: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setError(''); setMessage('')
    try {
      const { error } = await task()
      if (error) throw new Error(error.message)
      await load()
      setMessage(t('saved'))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggle() {
    if (provider?.online) return act(() => db.from('perfiles_proveedor').update({ online: false, disponible: false }).eq('usuario_id', profile.id))
    setBusy(true); setError('')
    try {
      const p = await coordinates()
      const { error } = await db.rpc('activar_disponibilidad_proveedor', { p_lat: p.lat, p_lng: p.lng, p_captured_at: p.captured, p_accuracy_m: p.accuracy })
      if (error) throw error
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function uploadDoc(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg','image/png','application/pdf'].includes(file.type) || file.size > 5_000_000) { setError('JPEG, PNG ou PDF · máximo 5 MB'); return }
    setBusy(true); setError('')
    try {
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
      const path = `${profile.id}/identidad_frente-${Date.now()}.${ext}`
      const { error: uploadError } = await db.storage.from('provider-kyc').upload(path, file, { upsert: false, contentType: file.type })
      if (uploadError) throw uploadError
      const { error } = await db.from('documentos').insert({ usuario_id: profile.id, tipo: 'identidad_frente', descripcion: 'Identidade · frente', url_storage: path, estado: 'pendiente' })
      if (error) throw error
      setHasDoc(true); setMessage(t('docSaved'))
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const value = Number(rate)
      if (!city.trim() || !category || !Number.isFinite(value) || value <= 0) throw new Error(t('baseRate'))
      const data = { bio: bio.trim() || null, ciudad_base: city.trim(), categoria_principal_id: category, experiencia_anos: experience ? Number(experience) : null, especialidades: specialties.trim() || null, tarifa_base: value }
      const query = provider ? db.from('perfiles_proveedor').update(data).eq('usuario_id', profile.id) : db.from('perfiles_proveedor').insert({ ...data, usuario_id: profile.id, estado_verificacion: 'registrado', onboarding_paso: 1 })
      const { error } = await query
      if (error) throw error
      await load(); setMessage(t('saved'))
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  async function submitReview() {
    setError(''); setMessage('')
    if (!provider || !hasDoc || !terms || !/^\d{11}$/.test(cpf.replace(/\D/g,'')) || !pix.trim() || !/^\+?[\d\s()\-]{8,20}$/.test(phone) || !category || !city.trim() || !Number(rate)) { setError(t('reviewNotice')); return }
    await act(() => db.from('perfiles_proveedor').update({ estado_verificacion: 'pendiente', cpf: cpf.replace(/\D/g,''), pix_tipo: 'cpf', pix_chave: pix.trim(), telefono_profesional: phone.trim(), termos_aceitos_at: new Date().toISOString(), termos_versao: '2026-09-04', onboarding_completo_at: new Date().toISOString(), onboarding_paso: 13, online: false, disponible: false }).eq('usuario_id', profile.id))
  }

  const nextState = (state: string): string | null => ({ asignado: 'en_camino', confirmado: 'en_camino', en_camino: 'llegado', llegado: 'ejecutando', ejecutando: 'completado' } as Record<string,string>)[state] || null

  const completedJobsCount = jobs.filter(j => j.estado === 'completado').length
  const activeJobsCount = jobs.filter(j => ['asignado', 'en_camino', 'llegado', 'ejecutando'].includes(j.estado)).length
  const estimatedEarnings = jobs.reduce((acc, curr) => (curr.estado === 'completado' ? acc + (curr.tarifa || Number(rate) || 0) : acc), 0)

  return (
    <div className="container inner-page">
      <div className="page-head">
        <Heading kicker="UGO / PROFISSIONAL" title={t('proArea')} subtitle={`${t('welcome')}, ${profile.nombre}.`}/>
        <Button variant="outline" onClick={() => void load()}>{t('refresh')}</Button>
      </div>

      <Notice text={error} error/>
      <Notice text={message}/>

      {/* Quick Metrics Bar */}
      <div className="pro-metrics-grid">
        <div className="pro-metric">
          <strong>{activeJobsCount}</strong>
          <span>{t('activeJobs')}</span>
        </div>
        <div className="pro-metric">
          <strong>{completedJobsCount}</strong>
          <span>{t('services')}</span>
        </div>
        <div className="pro-metric">
          <strong>{money(estimatedEarnings, locale)}</strong>
          <span>{t('proEarnings')}</span>
        </div>
      </div>

      {loading && <p>{t('loading')}</p>}

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">01 / {t('onlineToggle')}</span><h2>{t('onlineToggle')}</h2></div>
              <span className={`status-pill ${provider?.online ? 'status-active' : ''}`}>{provider?.online ? t('online') : t('offline')}</span>
            </div>
            <p className="muted">{t('gpsNotice')}</p>
            <Button disabled={busy || !provider || provider.estado_verificacion !== 'verificado'} onClick={() => void toggle()}>
              {provider?.online ? t('turnOff') : t('turnOn')} <ArrowRight size={16}/>
            </Button>
            <p className="subtle">{t('verification')}: {provider?.estado_verificacion === 'verificado' ? t('verifiedState') : t('pendingState')}</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">02 / UGO</span><h2>{t('offers')}</h2></div>
              <span className="count-badge">{offers.length}</span>
            </div>
            {offers.length ? offers.map(o => (
              <div className="offer-item" key={o.id}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="small-label">#{o.servicio?.numero} · {o.servicio?.categoria?.nombre || t('services')}</span>
                    <OfferCountdown expiresAt={o.expira_at} label={t('expiresIn')} secLabel={t('seconds')} />
                  </div>
                  <h3>{o.servicio?.descripcion || t('request')}</h3>
                  <p><MapPin size={14}/> {o.servicio?.zona_cliente || '—'} · {money(o.tarifa_ofrecida, locale)}</p>
                </div>
                <div className="offer-buttons">
                  <Button disabled={busy} onClick={() => void act(() => db.rpc('aceptar_oferta', { p_oferta_id: o.id }))}>{t('accept')}</Button>
                  <Button variant="outline" disabled={busy} onClick={() => void act(() => db.rpc('rechazar_oferta', { p_oferta_id: o.id }))}>{t('decline')}</Button>
                </div>
              </div>
            )) : <p className="muted">{t('noOffers')}</p>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">03 / UGO</span><h2>{t('activeJobs')}</h2></div>
            </div>
            {jobs.length ? jobs.map(j => (
              <div className="offer-item" key={j.id}>
                <div>
                  <span className="small-label">#{j.numero} · {j.estado.replaceAll('_', ' ')}</span>
                  <h3>{j.descripcion || t('services')}</h3>
                  <p>{date(j.created_at, locale)} · {money(j.tarifa, locale)}</p>
                </div>
                {nextState(j.estado) && (
                  <Button variant="outline" disabled={busy} onClick={() => void act(() => db.rpc(j.estado === 'en_camino' ? 'marcar_llegada_proveedor' : 'avanzar_servicio', j.estado === 'en_camino' ? { p_servicio_id: j.id } : { p_servicio_id: j.id, p_estado: nextState(j.estado) }))}>
                    {t(j.estado === 'en_camino' ? 'arrive' : j.estado === 'ejecutando' ? 'finished' : 'progress')}
                  </Button>
                )}
              </div>
            )) : <p className="muted">{t('noJobs')}</p>}
          </section>
        </div>

        <aside className="panel pro-profile">
          <div className="eyebrow">04 / PERFIL</div>
          <h2>{t('proProfile')}</h2>
          <form onSubmit={save}>
            <label>{t('bio')}<textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={800} rows={4}/></label>
            <label>{t('baseCity')}<input value={city} onChange={e => setCity(e.target.value)} maxLength={100}/></label>
            <label>{t('chooseCategory')}<select value={category} onChange={e => setCategory(e.target.value)}><option value="">—</option>{categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}</select></label>
            <label>{t('specialty')}<input value={specialties} onChange={e => setSpecialties(e.target.value)} maxLength={180}/></label>
            <label>{t('experience')}<input type="number" value={experience} onChange={e => setExperience(e.target.value)} min={0} max={80}/></label>
            <label>{t('baseRate')}<input type="number" required value={rate} onChange={e => setRate(e.target.value)} min={1} step="0.01"/></label>
            <Button type="submit" disabled={busy || !provider}>{t('save')} <ArrowRight size={16}/></Button>
          </form>

          {provider && provider.estado_verificacion !== 'verificado' && provider.estado_verificacion !== 'pendiente' && (
            <div className="review-form">
              <p className="muted">{t('reviewNotice')}</p>
              <label>{t('phone')}<input type="tel" value={phone} onChange={e => setPhone(e.target.value)}/></label>
              <label>{t('cpf')}<input inputMode="numeric" value={cpf} onChange={e => setCpf(e.target.value)}/></label>
              <label>{t('pixKey')}<input value={pix} onChange={e => setPix(e.target.value)}/></label>
              <label>{t('idDoc')}<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => void uploadDoc(e.target.files?.[0])}/></label>
              <p className="muted">{hasDoc ? '✓ ' : ''}{t('privacy')}</p>
              <label className="check-field"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}/>{t('acceptTerms')}</label>
              <Button disabled={busy || !hasDoc} onClick={() => void submitReview()}>{t('submitReview')}</Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Admin() {
  const { t, locale } = useI18n(), [users, setUsers] = useState<{ id: string; nombre: string; tipo: string; email: string; activo: boolean }[]>([]), [jobs, setJobs] = useState<Service[]>([]), [counts, setCounts] = useState({ users: 0, jobs: 0, active: 0, pending: 0 }), [error, setError] = useState(''), [busy, setBusy] = useState(true)
  const load = useCallback(async () => {
    setBusy(true); setError('')
    const [u, s, uc, sc, ac, pc] = await Promise.all([
      db.from('usuarios').select('id,nombre,tipo,email,activo').order('fecha_registro', { ascending: false }).limit(8),
      db.from('servicios').select('id,numero,cliente_id,proveedor_id,categoria_id,descripcion,direccion_cliente,estado,tarifa,created_at,programado_para').order('created_at', { ascending: false }).limit(10),
      db.from('usuarios').select('id', { count: 'exact', head: true }),
      db.from('servicios').select('id', { count: 'exact', head: true }),
      db.from('servicios').select('id', { count: 'exact', head: true }).in('estado', ['buscando','ofrecido','asignado','en_camino','llegado','ejecutando']),
      db.from('perfiles_proveedor').select('usuario_id', { count: 'exact', head: true }).eq('estado_verificacion','pendiente')
    ])
    const failure = [u.error,s.error,uc.error,sc.error,ac.error,pc.error].find(Boolean)
    if (failure) setError(failure.message)
    else {
      setUsers(u.data || [])
      setJobs((s.data || []) as Service[])
      setCounts({ users: uc.count || 0, jobs: sc.count || 0, active: ac.count || 0, pending: pc.count || 0 })
    }
    setBusy(false)
  }, [])
  useEffect(() => { void load() }, [load])
  return (
    <div className="container inner-page">
      <div className="page-head">
        <Heading kicker="UGO / ADMIN" title={t('adminArea')} subtitle={t('adminIntro')}/>
        <Button variant="outline" onClick={() => void load()}>{t('refresh')}</Button>
      </div>
      <Notice text={error} error/>
      {busy && <p>{t('loading')}</p>}
      <div className="stat-grid">
        {([[t('users'),counts.users,UserRound],[t('totalJobs'),counts.jobs,BriefcaseBusiness],[t('activeJobsCount'),counts.active,Compass],[t('pendingPros'),counts.pending,ShieldCheck]] as const).map(([label,value,Icon]) => (
          <div className="stat" key={label}>
            <Icon size={22} strokeWidth={1.5}/>
            <strong>{error ? '—' : value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="admin-columns">
        <section className="panel">
          <h2>{t('recentJobs')}</h2>
          {jobs.map(j => (
            <div className="admin-row" key={j.id}>
              <span>#{j.numero}<small>{date(j.created_at,locale)}</small></span>
              <span className="truncate">{j.descripcion || t('services')}</span>
              <span className="status-pill">{j.estado}</span>
            </div>
          ))}
          {!jobs.length && <p>{t('none')}</p>}
        </section>
        <section className="panel">
          <h2>{t('recentUsers')}</h2>
          {users.map(u => (
            <div className="admin-row" key={u.id}>
              <span className="admin-avatar">{u.nombre?.[0] || 'U'}</span>
              <span className="truncate">{u.nombre}<small>{u.email}</small></span>
              <span className="status-pill">{u.tipo}</span>
            </div>
          ))}
          {!users.length && <p>{t('none')}</p>}
        </section>
      </div>
    </div>
  )
}
