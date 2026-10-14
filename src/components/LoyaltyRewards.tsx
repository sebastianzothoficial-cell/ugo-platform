import { useState, useEffect } from 'react'
import { Coins, Award, Ticket, Copy, Check, Sparkles, ArrowRight, Gift, ShieldCheck, ChevronRight, Users, PlusCircle } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Profile } from '../lib'

export interface Coupon {
  id: string
  code: string
  title: string
  discount: string
  minSpend?: number
  validUntil: string
  type: 'percent' | 'fixed' | 'free_addon'
  used?: boolean
}

export interface LoyaltyData {
  coins: number
  totalEarned: number
  history: { id: string; desc: string; amount: number; date: string; type: 'earn' | 'spend' }[]
  coupons: Coupon[]
}

const DEFAULT_COUPONS: Coupon[] = [
  {
    id: 'c1',
    code: 'BEMVINDO15',
    title: 'Desconto de Boas-vindas',
    discount: '15% OFF',
    validUntil: '2026-12-31',
    type: 'percent'
  },
  {
    id: 'c2',
    code: 'UGOCASH10',
    title: 'Crédito Primeira Solicitação',
    discount: '$10 OFF',
    minSpend: 40,
    validUntil: '2026-11-30',
    type: 'fixed'
  },
  {
    id: 'c3',
    code: 'GARANTIAFREE',
    title: 'Garantia Estendida UGO Care',
    discount: 'Garantia Grátis',
    validUntil: '2026-10-31',
    type: 'free_addon'
  }
]

export default function LoyaltyRewards({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const storageKey = `ugo-loyalty-${profile.id}`

  const [loyalty, setLoyalty] = useState<LoyaltyData>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved)
    } catch {
      // fallback
    }
    return {
      coins: 250,
      totalEarned: 350,
      history: [
        { id: 'h1', desc: 'Bônus de Cadastro UGO', amount: 200, date: '2026-09-01', type: 'earn' },
        { id: 'h2', desc: 'Perfil Verificado', amount: 50, date: '2026-09-05', type: 'earn' }
      ],
      coupons: DEFAULT_COUPONS
    }
  })

  const [promoInput, setPromoInput] = useState('')
  const [promoMessage, setPromoMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'wallet' | 'perks' | 'history'>('wallet')

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(loyalty))
    } catch {
      // ignore storage error
    }
  }, [loyalty, storageKey])

  // Determine tier
  let tier: 'silver' | 'gold' | 'platinum' = 'silver'
  let nextTier = 'gold'
  let coinsNeeded = 500
  let progressPercent = 0

  if (loyalty.coins >= 1500) {
    tier = 'platinum'
    nextTier = 'platinum'
    progressPercent = 100
  } else if (loyalty.coins >= 500) {
    tier = 'gold'
    nextTier = 'platinum'
    coinsNeeded = 1500
    progressPercent = Math.min(100, Math.round(((loyalty.coins - 500) / 1000) * 100))
  } else {
    tier = 'silver'
    nextTier = 'gold'
    coinsNeeded = 500
    progressPercent = Math.min(100, Math.round((loyalty.coins / 500) * 100))
  }

  const tierColors = {
    silver: {
      badgeBg: '#f1f5f9',
      badgeBorder: '#cbd5e1',
      badgeText: '#475569',
      gradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      accent: '#64748b'
    },
    gold: {
      badgeBg: '#fef3c7',
      badgeBorder: '#fde68a',
      badgeText: '#92400e',
      gradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      accent: '#d97706'
    },
    platinum: {
      badgeBg: '#e0e7ff',
      badgeBorder: '#c7d2fe',
      badgeText: '#3730a3',
      gradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      accent: '#6366f1'
    }
  }

  const currentTheme = tierColors[tier]

  function copyToClipboard(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2500)
    }).catch(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2500)
    })
  }

  function handleRedeemPromo(e: React.FormEvent) {
    e.preventDefault()
    const clean = promoInput.trim().toUpperCase()
    if (!clean) return

    // Check if already in coupons
    if (loyalty.coupons.some(c => c.code === clean)) {
      setPromoMessage({ text: 'Você já possui esse cupom na sua carteira!', error: true })
      return
    }

    let newCoupon: Coupon | null = null
    let bonusCoins = 0

    if (clean === 'UGOVIP') {
      newCoupon = { id: `c-${Date.now()}`, code: clean, title: 'Cupom Exclusivo VIP', discount: '20% OFF', validUntil: '2026-12-31', type: 'percent' }
      bonusCoins = 100
    } else if (clean === 'DESCONTO25') {
      newCoupon = { id: `c-${Date.now()}`, code: clean, title: 'Desconto Super 25%', discount: '25% OFF', validUntil: '2026-12-15', type: 'percent' }
      bonusCoins = 50
    } else if (clean === 'UGOPROMO' || clean === 'UGO2026') {
      newCoupon = { id: `c-${Date.now()}`, code: clean, title: 'Bônus UGO 2026', discount: '$15 OFF', minSpend: 50, validUntil: '2026-11-30', type: 'fixed' }
      bonusCoins = 30
    } else {
      // General promotional voucher
      newCoupon = { id: `c-${Date.now()}`, code: clean, title: 'Vale Promocional UGO', discount: '$5 OFF', validUntil: '2026-12-31', type: 'fixed' }
      bonusCoins = 20
    }

    setLoyalty(prev => ({
      ...prev,
      coins: prev.coins + bonusCoins,
      totalEarned: prev.totalEarned + bonusCoins,
      coupons: [newCoupon!, ...prev.coupons],
      history: [
        { id: `h-${Date.now()}`, desc: `Cupom Resgatado: ${clean} (+${bonusCoins} coins)`, amount: bonusCoins, date: new Date().toISOString().slice(0, 10), type: 'earn' },
        ...prev.history
      ]
    }))

    setPromoInput('')
    setPromoMessage({ text: `${t('couponApplied')} (+${bonusCoins} ${t('ugoCoins')})` })
  }

  function simulateServiceReward() {
    const earnAmount = tier === 'platinum' ? 30 : tier === 'gold' ? 20 : 15
    setLoyalty(prev => ({
      ...prev,
      coins: prev.coins + earnAmount,
      totalEarned: prev.totalEarned + earnAmount,
      history: [
        { id: `h-${Date.now()}`, desc: `Serviço Concluído com Sucesso`, amount: earnAmount, date: new Date().toISOString().slice(0, 10), type: 'earn' },
        ...prev.history
      ]
    }))
    setPromoMessage({ text: `+${earnAmount} UGO Coins adicionados à sua conta!` })
  }

  function exchangeCoinsForCoupon() {
    if (loyalty.coins < 100) {
      setPromoMessage({ text: 'Você precisa de pelo menos 100 UGO Coins para resgatar.', error: true })
      return
    }

    const newCode = `REWARD-${Math.floor(1000 + Math.random() * 9000)}`
    const newCoupon: Coupon = {
      id: `c-${Date.now()}`,
      code: newCode,
      title: 'Desconto Resgatado com Coins',
      discount: '$10 OFF',
      minSpend: 30,
      validUntil: '2026-12-31',
      type: 'fixed'
    }

    setLoyalty(prev => ({
      ...prev,
      coins: prev.coins - 100,
      coupons: [newCoupon, ...prev.coupons],
      history: [
        { id: `h-${Date.now()}`, desc: `Resgate de Cupom $10 OFF (${newCode})`, amount: 100, date: new Date().toISOString().slice(0, 10), type: 'spend' },
        ...prev.history
      ]
    }))
    setPromoMessage({ text: `Cupom ${newCode} ($10 OFF) adicionado à sua carteira!` })
  }

  return (
    <div className="loyalty-container" style={{ marginBottom: 35 }}>
      {/* Top Banner Card */}
      <div
        className="loyalty-hero-card"
        style={{
          background: '#fff',
          border: '1px solid #e2e8df',
          borderRadius: 16,
          padding: '24px 28px',
          boxShadow: '0 4px 20px rgba(24, 62, 48, 0.05)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          {/* Coins info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: currentTheme.gradient,
                border: `2px solid ${currentTheme.badgeBorder}`,
                display: 'grid',
                placeItems: 'center',
                color: currentTheme.accent,
                boxShadow: '0 6px 16px rgba(0,0,0,0.06)'
              }}
            >
              <Coins size={28} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#627d66', textTransform: 'uppercase' }}>
                  {t('loyaltyRewards')}
                </span>
                <span
                  style={{
                    background: currentTheme.badgeBg,
                    border: `1px solid ${currentTheme.badgeBorder}`,
                    color: currentTheme.badgeText,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 12,
                    textTransform: 'uppercase'
                  }}
                >
                  <Award size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                  {t(tier === 'platinum' ? 'platinumTier' : tier === 'gold' ? 'goldTier' : 'silverTier')}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 32, fontWeight: 800, color: '#183e30', letterSpacing: '-0.04em' }}>
                  {loyalty.coins}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#556b5a' }}>
                  {t('ugoCoins')}
                </span>
              </div>
            </div>
          </div>

          {/* Quick buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={simulateServiceReward}
              className="btn btn-outline"
              style={{ fontSize: 12, padding: '9px 14px', borderRadius: 8 }}
              title="Simular conclusão de serviço e acumular moedas"
            >
              <Sparkles size={14} style={{ marginRight: 6 }} />
              +15 Coins (Serviço)
            </button>
            <button
              type="button"
              onClick={exchangeCoinsForCoupon}
              className="btn btn-dark"
              style={{ fontSize: 12, padding: '9px 14px', borderRadius: 8 }}
              disabled={loyalty.coins < 100}
              title="Trocar 100 Coins por um cupom de $10 OFF"
            >
              <Gift size={14} style={{ marginRight: 6 }} />
              Trocar 100 Coins ($10 OFF)
            </button>
          </div>
        </div>

        {/* Next Tier Progress Bar */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #eef2eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: '#596d5e', fontWeight: 600 }}>
              {tier === 'platinum' ? (
                <span style={{ color: '#183e30', fontWeight: 700 }}>✦ Nível VIP Máximo alcançado</span>
              ) : (
                <>
                  {t('nextTierProgress')}: <strong>{t(nextTier === 'platinum' ? 'platinumTier' : 'goldTier')}</strong> ({loyalty.coins}/{coinsNeeded} coins)
                </>
              )}
            </span>
            <span style={{ fontWeight: 800, color: '#183e30' }}>
              {progressPercent}%
            </span>
          </div>

          <div style={{ width: '100%', height: 8, background: '#e8eee5', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: tier === 'gold' ? 'linear-gradient(90deg, #f59e0b, #d97706)' : tier === 'platinum' ? 'linear-gradient(90deg, #6366f1, #4f46e5)' : 'linear-gradient(90deg, #3b82f6, #183e30)',
                borderRadius: 99,
                transition: 'width 0.4s ease'
              }}
            />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#7a8c7e' }}>
            {t('earnCoinsNote')}
          </p>
        </div>
      </div>

      {/* Tabs Row for Wallet / Perks / History */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => setActiveTab('wallet')}
          style={{
            border: '1px solid',
            borderColor: activeTab === 'wallet' ? '#183e30' : '#d8dfd4',
            background: activeTab === 'wallet' ? '#183e30' : '#fff',
            color: activeTab === 'wallet' ? '#fff' : '#4b5d4f',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer'
          }}
        >
          <Ticket size={15} />
          {t('walletView')} ({loyalty.coupons.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('perks')}
          style={{
            border: '1px solid',
            borderColor: activeTab === 'perks' ? '#183e30' : '#d8dfd4',
            background: activeTab === 'perks' ? '#183e30' : '#fff',
            color: activeTab === 'perks' ? '#fff' : '#4b5d4f',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer'
          }}
        >
          <Award size={15} />
          {t('tierPerks')}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            border: '1px solid',
            borderColor: activeTab === 'history' ? '#183e30' : '#d8dfd4',
            background: activeTab === 'history' ? '#183e30' : '#fff',
            color: activeTab === 'history' ? '#fff' : '#4b5d4f',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer'
          }}
        >
          <Coins size={15} />
          Extrato ({loyalty.history.length})
        </button>
      </div>

      {promoMessage && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            background: promoMessage.error ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${promoMessage.error ? '#fecaca' : '#bbf7d0'}`,
            color: promoMessage.error ? '#991b1b' : '#166534',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{promoMessage.text}</span>
          <button
            type="button"
            onClick={() => setPromoMessage(null)}
            style={{ border: 0, background: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB CONTENT: WALLET VIEW */}
      {activeTab === 'wallet' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Redeem Promo Input Form */}
          <form
            onSubmit={handleRedeemPromo}
            style={{
              display: 'flex',
              gap: 10,
              background: '#fff',
              padding: 12,
              borderRadius: 12,
              border: '1px solid #e1e7dc'
            }}
          >
            <input
              type="text"
              value={promoInput}
              onChange={e => setPromoInput(e.target.value)}
              placeholder="Inserir código de cupom ou vale (ex: UGOVIP, DESCONTO25)..."
              style={{
                flex: 1,
                border: '1px solid #d5dfd1',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                textTransform: 'uppercase',
                fontWeight: 600
              }}
            />
            <button
              type="submit"
              className="btn btn-dark"
              style={{ padding: '10px 18px', fontSize: 13, borderRadius: 8 }}
            >
              <PlusCircle size={15} style={{ marginRight: 6 }} />
              {t('applyCoupon')}
            </button>
          </form>

          {/* Coupons List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {loyalty.coupons.map(coupon => {
              const isCopied = copiedCode === coupon.code
              return (
                <div
                  key={coupon.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e3e8de',
                    borderRadius: 12,
                    padding: 16,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <span
                        style={{
                          fontSize: 18,
                          fontFamily: 'Manrope, sans-serif',
                          fontWeight: 800,
                          color: '#183e30',
                          display: 'block'
                        }}
                      >
                        {coupon.discount}
                      </span>
                      <strong style={{ fontSize: 13, color: '#334155' }}>
                        {coupon.title}
                      </strong>
                    </div>
                    <span
                      style={{
                        background: '#f1f5f0',
                        color: '#295438',
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.05em'
                      }}
                    >
                      {coupon.type.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px dashed #e2e8df', paddingTop: 12, marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 11, color: '#64748b' }}>
                      <span>{coupon.minSpend ? `Mínimo: $${coupon.minSpend}` : 'Sem valor mínimo'}</span>
                      <span>Válido até {coupon.validUntil}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div
                        style={{
                          flex: 1,
                          background: '#f8faf7',
                          border: '1px solid #d9e2d5',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#183e30',
                          letterSpacing: '0.08em',
                          textAlign: 'center'
                        }}
                      >
                        {coupon.code}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(coupon.code)}
                        style={{
                          border: '1px solid #cbd5e1',
                          background: isCopied ? '#22c55e' : '#fff',
                          color: isCopied ? '#fff' : '#1e293b',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                        {isCopied ? t('copied') : t('copyCode')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB CONTENT: TIER PERKS */}
      {activeTab === 'perks' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {/* Silver */}
          <div
            style={{
              background: '#fff',
              border: `1px solid ${tier === 'silver' ? '#2563eb' : '#e2e8f0'}`,
              borderRadius: 12,
              padding: 20,
              boxShadow: tier === 'silver' ? '0 0 0 2px #93c5fd' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, margin: 0, color: '#334155' }}>Nível Prata (Silver)</h3>
              <span style={{ fontSize: 11, color: '#64748b' }}>0 - 499 coins</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
              <li>1x Coins a cada serviço concluído</li>
              <li>Acesso a cupons de boas-vindas</li>
              <li>Garantia padrão de serviço (7 dias)</li>
              <li>Suporte regular via aplicativo</li>
            </ul>
          </div>

          {/* Gold */}
          <div
            style={{
              background: '#fff',
              border: `1px solid ${tier === 'gold' ? '#f59e0b' : '#e2e8f0'}`,
              borderRadius: 12,
              padding: 20,
              boxShadow: tier === 'gold' ? '0 0 0 2px #fde68a' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, margin: 0, color: '#92400e' }}>Nível Ouro (Gold)</h3>
              <span style={{ fontSize: 11, color: '#b45309' }}>500 - 1.499 coins</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
              <li><strong>1.5x Coins</strong> em todos os serviços</li>
              <li>Matching prioritário com profissionais top avaliados</li>
              <li>5% de cashback em moedas UGO</li>
              <li>Garantia estendida de 15 dias</li>
              <li>Cupons sazonais exclusivos</li>
            </ul>
          </div>

          {/* Platinum */}
          <div
            style={{
              background: '#fff',
              border: `1px solid ${tier === 'platinum' ? '#6366f1' : '#e2e8f0'}`,
              borderRadius: 12,
              padding: 20,
              boxShadow: tier === 'platinum' ? '0 0 0 2px #c7d2fe' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, margin: 0, color: '#3730a3' }}>Nível Platina (Platinum)</h3>
              <span style={{ fontSize: 11, color: '#4338ca' }}>1.500+ coins</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
              <li><strong>2x Coins</strong> em todos os agendamentos</li>
              <li>Taxa de serviço da plataforma zerada</li>
              <li>10% de cashback em moedas UGO</li>
              <li>Garantia estendida total de 30 dias</li>
              <li>Canal de atendimento VIP prioritário 24/7</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB CONTENT: HISTORY EXTRACT */}
      {activeTab === 'history' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8df', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #edf1ea', fontSize: 13, fontWeight: 700, color: '#183e30' }}>
            Histórico de Movimentações de UGO Coins
          </div>
          <div style={{ divideY: '1px solid #edf1ea' }}>
            {loyalty.history.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 18px',
                  borderBottom: '1px solid #f1f4ee',
                  fontSize: 12
                }}
              >
                <div>
                  <strong style={{ display: 'block', color: '#1e293b', fontSize: 13 }}>
                    {item.desc}
                  </strong>
                  <span style={{ color: '#64748b', fontSize: 11 }}>
                    {item.date}
                  </span>
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    color: item.type === 'earn' ? '#16a34a' : '#dc2626'
                  }}
                >
                  {item.type === 'earn' ? `+${item.amount}` : `-${item.amount}`} Coins
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
