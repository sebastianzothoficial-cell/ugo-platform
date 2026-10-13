import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'

type Lang = 'pt-BR' | 'es' | 'en'
type Role = 'cliente' | 'proveedor' | 'admin'
type Profile = { id: string; nombre?: string; apellido?: string; email?: string; tipo?: Role; foto_url?: string | null }
type Service = { id: string; numero?: number; estado?: string; descripcion?: string; zona?: string; tarifa?: number; created_at?: string; categoria?: { nombre?: string } | null }
const copy = {
  'pt-BR': { tagline:'Serviços locais, sem complicação.', welcome:'Encontre profissionais de confiança para o seu dia a dia.', login:'Entrar', signup:'Criar conta', email:'E-mail', password:'Senha', name:'Nome completo', role:'Quero usar a UGO como', client:'Cliente', provider:'Profissional', admin:'Administrador', marketplace:'Explorar serviços', requests:'Meus pedidos', profile:'Perfil', logout:'Sair', search:'O que você precisa hoje?', categories:'Categorias', active:'Serviços ativos', recent:'Atividade recente', noServices:'Nenhum serviço disponível para mostrar ainda.', connect:'Conecte o Supabase para carregar os dados reais.', config:'Configuração pendente', loading:'Carregando…', error:'Não foi possível concluir a operação.', signInHint:'Entre para acessar suas solicitações e seu perfil.', empty:'Ainda não há atividade para mostrar.', all:'Visão geral', refresh:'Atualizar', language:'Idioma', roleNote:'O acesso administrativo depende das permissões reais da conta; escolher um papel aqui não concede privilégios.', passwordMin:'Use uma senha com pelo menos 8 caracteres.', success:'Conta criada. Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.', noProfile:'Sua sessão está ativa, mas o perfil em public.usuarios não pôde ser carregado. Verifique as permissões e o vínculo auth_id.' },
  es: { tagline:'Servicios locales, sin complicaciones.', welcome:'Encontrá profesionales de confianza para tu día a día.', login:'Ingresar', signup:'Crear cuenta', email:'Correo electrónico', password:'Contraseña', name:'Nombre completo', role:'Quiero usar UGO como', client:'Cliente', provider:'Profesional', admin:'Administrador', marketplace:'Explorar servicios', requests:'Mis solicitudes', profile:'Perfil', logout:'Cerrar sesión', search:'¿Qué necesitás hoy?', categories:'Categorías', active:'Servicios activos', recent:'Actividad reciente', noServices:'Todavía no hay servicios para mostrar.', connect:'Conectá Supabase para cargar los datos reales.', config:'Configuración pendiente', loading:'Cargando…', error:'No se pudo completar la operación.', signInHint:'Ingresá para acceder a tus solicitudes y tu perfil.', empty:'Todavía no hay actividad para mostrar.', all:'Resumen', refresh:'Actualizar', language:'Idioma', roleNote:'El acceso administrativo depende de los permisos reales de la cuenta; elegir un rol aquí no otorga privilegios.', passwordMin:'Usá una contraseña de al menos 8 caracteres.', success:'Cuenta creada. Si la confirmación por correo está activa, revisá tu bandeja.', noProfile:'La sesión está activa, pero no se pudo cargar el perfil de public.usuarios. Verificá los permisos y el vínculo auth_id.' },
  en: { tagline:'Local services, made simple.', welcome:'Find trusted professionals for everyday needs.', login:'Sign in', signup:'Create account', email:'Email', password:'Password', name:'Full name', role:'I want to use UGO as', client:'Client', provider:'Professional', admin:'Administrator', marketplace:'Explore services', requests:'My requests', profile:'Profile', logout:'Sign out', search:'What do you need today?', categories:'Categories', active:'Active services', recent:'Recent activity', noServices:'No services to show yet.', connect:'Connect Supabase to load real data.', config:'Setup pending', loading:'Loading…', error:'The operation could not be completed.', signInHint:'Sign in to access your requests and profile.', empty:'No activity to show yet.', all:'Overview', refresh:'Refresh', language:'Language', roleNote:'Admin access depends on the account’s actual permissions; selecting a role here does not grant privileges.', passwordMin:'Use a password with at least 8 characters.', success:'Account created. If email confirmation is enabled, check your inbox.', noProfile:'Your session is active, but public.usuarios profile could not be loaded. Check permissions and auth_id mapping.' },
} satisfies Record<Lang, Record<string, string>>

function getInitialLang(): Lang {
  try { const saved = localStorage.getItem('ugo-language'); if (saved === 'es' || saved === 'en' || saved === 'pt-BR') return saved } catch { /* storage may be disabled */ }
  return 'pt-BR'
}

export default function App() {
  const [lang, setLang] = useState<Lang>(getInitialLang)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<Array<{id:string;nombre:string;emoji?:string}>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [requestedRole, setRequestedRole] = useState<'cliente'|'proveedor'>('cliente')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const t = copy[lang]

  const loadData = useCallback(async (activeSession: Session | null) => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const [serviceResult, categoryResult] = await Promise.all([
      supabase.from('servicios').select('id,numero,estado,descripcion,zona,tarifa,created_at,categoria:categorias(nombre)').order('created_at', { ascending: false }).limit(8),
      supabase.from('categorias').select('id,nombre,emoji').eq('activa', true).order('nombre').limit(30),
    ])
    setServices((serviceResult.data ?? []) as unknown as Service[])
    setCategories((categoryResult.data ?? []) as Array<{id:string;nombre:string;emoji?:string}>)
    if (activeSession) {
      const result = await supabase.from('usuarios').select('id,nombre,apellido,email,tipo,foto_url').eq('auth_id', activeSession.user.id).maybeSingle()
      setProfile((result.data as Profile | null) ?? null)
      if (result.error) setNotice(result.error.message)
    } else setProfile(null)
    setLoading(false)
  }, [])

  useEffect(() => { try { localStorage.setItem('ugo-language', lang) } catch { /* ignore */ } }, [lang])
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); void loadData(data.session) } })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (alive) window.setTimeout(() => { if (alive) void loadData(nextSession) }, 0)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [loadData])

  const visibleServices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return services
    return services.filter((s) => `${s.descripcion ?? ''} ${s.zona ?? ''} ${s.categoria?.nombre ?? ''}`.toLocaleLowerCase().includes(normalized))
  }, [query, services])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice('')
    if (!supabase) return
    if (password.length < 8) { setNotice(t.passwordMin); return }
    setBusy(true)
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { nombre: fullName.trim(), tipo_solicitado: requestedRole } } })
        if (error) throw error
        if (data.session) { setSession(data.session); setNotice(t.success) } else setNotice(t.success)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        setSession(data.session); setNotice('')
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : t.error) }
    finally { setBusy(false) }
  }

  async function signOut() { if (!supabase) return; const { error } = await supabase.auth.signOut(); if (error) setNotice(error.message); else { setSession(null); setProfile(null) } }
  const role = profile?.tipo
  const roleLabel = role === 'admin' ? t.admin : role === 'proveedor' ? t.provider : t.client

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#inicio" aria-label="UGO início"><span className="brand-mark">U</span><span>UGO<span className="brand-dot">.</span></span></a><nav className="top-actions"><label className="language-label"><span>{t.language}</span><select aria-label={t.language} value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="pt-BR">Português</option><option value="es">Español</option><option value="en">English</option></select></label>{session && <button className="button button-quiet" onClick={() => void signOut()}>{t.logout}</button>}</nav></header>
    <main id="inicio">
      {!session ? <section className="hero-grid"><div className="hero-copy"><div className="eyebrow"><span className="status-dot"/> MARKETPLACE DE SERVIÇOS</div><h1>Seu próximo serviço.<br/><span>Resolvido com UGO.</span></h1><p className="hero-lead">{t.welcome}</p><div className="trust-row"><div className="trust-icon">✓</div><span>Perfis, solicitações e acompanhamento em um só lugar.</span></div><div className="hero-visual" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><div className="service-float float-top"><span>✦</span> Serviço sob medida</div><div className="service-float float-bottom"><span className="mini-avatar">U</span><div><strong>Conexões locais</strong><small>Cliente ↔ Profissional</small></div><span className="live-dot"/></div><div className="hero-ring"/></div></div>
        <div className="auth-card"><div className="auth-card-head"><div className="auth-symbol">↗</div><h2>{isSignup ? t.signup : t.login}</h2><p>{t.signInHint}</p></div>
          {!supabaseConfigured && <div className="notice notice-warning"><strong>{t.config}</strong><p>{t.connect}</p><small>Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de build.</small></div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          <form onSubmit={submitAuth} className="auth-form">
            {isSignup && <><label>{t.name}<input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2}/></label><label>{t.role}<select value={requestedRole} onChange={(e) => setRequestedRole(e.target.value as 'cliente'|'proveedor')}><option value="cliente">{t.client}</option><option value="proveedor">{t.provider}</option></select></label><p className="helper-text">{t.roleNote}</p></>}
            <label>{t.email}<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required/></label><label>{t.password}<input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}/></label>
            <button className="button button-primary button-full" type="submit" disabled={busy || !supabaseConfigured}>{busy ? t.loading : isSignup ? t.signup : t.login}<span aria-hidden="true">→</span></button>
          </form><p className="switch-auth">{isSignup ? 'Já tem uma conta?' : 'Ainda não tem conta?'} <button onClick={() => { setIsSignup(!isSignup); setNotice('') }}>{isSignup ? t.login : t.signup}</button></p><p className="auth-legal">Ao continuar, você concorda com os termos e a política de privacidade da UGO.</p>
        </div></section> : <section className="dashboard"><div className="dashboard-heading"><div><div className="eyebrow"><span className="status-dot"/> ESPAÇO UGO</div><h1>Olá{profile?.nombre ? `, ${profile.nombre}` : ''} <span className="wave">✦</span></h1><p>{t.tagline}</p></div><button className="button button-secondary" onClick={() => void loadData(session)}>{t.refresh} ↻</button></div>
        {notice && <div className="notice" role="status">{notice}</div>}{!profile && <div className="notice notice-warning">{t.noProfile}</div>}
        <div className="dashboard-grid"><article className="welcome-card"><div className="welcome-card-content"><span className="pill">{roleLabel}</span><h2>{role === 'admin' ? 'Painel de operação' : role === 'proveedor' ? 'Sua próxima oportunidade começa aqui.' : 'O que vamos resolver hoje?'}</h2><p>{t.welcome}</p><label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search}/></label></div><div className="welcome-art" aria-hidden="true"><div className="art-circle">U</div><span className="art-star star-a">✦</span><span className="art-star star-b">✧</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>{t.categories}</span><span className="metric-icon">◇</span></div><strong>{categories.length}</strong><small>Disponíveis no marketplace</small></article><article className="metric-card"><div className="metric-top"><span>{t.active}</span><span className="metric-icon">↗</span></div><strong>{services.filter((s) => !['completado','cancelado'].includes(s.estado ?? '')).length}</strong><small>{t.recent}</small></article></div>
        <div className="section-heading"><div><h2>{t.marketplace}</h2><p>Serviços e atividade recente</p></div><span className="subtle-count">{visibleServices.length} resultados</span></div>
        {loading ? <div className="loading-panel">{t.loading}</div> : visibleServices.length === 0 ? <div className="empty-panel"><div className="empty-icon">◇</div><h3>{t.noServices}</h3><p>Quando houver dados visíveis para sua conta, eles aparecerão aqui.</p></div> : <div className="service-grid">{visibleServices.map((service) => <article className="service-card" key={service.id}><div className="service-card-top"><span className="service-icon">{service.categoria?.nome ? '✦' : '⌂'}</span><span className={`state-pill state-${(service.estado ?? 'aberto').replace(/[^a-z_]/g,'')}`}>{service.estado ?? '—'}</span></div><h3>{service.categoria?.nome ?? `Serviço #${service.numero ?? service.id.slice(0,6)}`}</h3><p>{service.descripcion || 'Solicitação de serviço'}</p><div className="service-meta"><span>⌖ {service.zona || 'Local a confirmar'}</span>{typeof service.tarifa === 'number' && <strong>{new Intl.NumberFormat(lang, {style:'currency',currency:'BRL',maximumFractionDigits:2}).format(service.tarifa)}</strong>}</div></article>)}</div>}
        <div className="role-note"><span>ⓘ</span><p>{role === 'admin' ? 'As operações administrativas devem ser autorizadas no banco e nas políticas RLS.' : 'As ações disponíveis são limitadas à sua sessão e às permissões definidas no banco de dados.'}</p></div>
      </section>}
    </main><footer><span>© {new Date().getFullYear()} UGO Platform</span><span>Feito para conectar pessoas e serviços.</span></footer>
  </div>
}
