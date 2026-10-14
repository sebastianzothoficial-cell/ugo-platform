import { useState } from 'react'
import { ChevronDown, HelpCircle, User, Briefcase, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n'

interface FaqItem {
  id: string
  audience: 'client' | 'pro'
  question: {
    'pt-BR': string
    es: string
    en: string
  }
  answer: {
    'pt-BR': string
    es: string
    en: string
  }
}

const FAQ_DATA: FaqItem[] = [
  // --- Clientes ---
  {
    id: 'c1',
    audience: 'client',
    question: {
      'pt-BR': 'Como funciona a solicitação de um profissional no UGO?',
      es: '¿Cómo funciona la solicitud de un profesional en UGO?',
      en: 'How does requesting a professional on UGO work?'
    },
    answer: {
      'pt-BR': 'É muito simples: você escolhe a categoria do serviço desejado, descreve o que precisa ser feito e informa sua localização. O UGO conecta você aos profissionais verificados mais próximos na sua região, você recebe propostas transparentes e pode acompanhar o status em tempo real.',
      es: 'Es muy sencillo: elegís la categoría del servicio, describís qué necesitás y ponés tu ubicación. UGO te conecta con los profesionales verificados más cercanos de tu zona, recibís presupuestos claros y podés seguir el estado del pedido en tiempo real.',
      en: 'It is very simple: select the service category, describe what needs to be done, and confirm your location. UGO connects you to verified nearby professionals, you receive transparent quotes, and you can track the status in real time.'
    }
  },
  {
    id: 'c2',
    audience: 'client',
    question: {
      'pt-BR': 'Os profissionais da plataforma são verificados e confiáveis?',
      es: '¿Los profesionales de la plataforma son verificados y confiables?',
      en: 'Are professionals on the platform verified and trustworthy?'
    },
    answer: {
      'pt-BR': 'Sim! Todos os profissionais passam por conferência de identidade (documento oficial e CPF) antes de serem ativados para atendimento. Além disso, cada profissional possui um indicador de Karma e avaliações autênticas deixadas exclusivamente por clientes reais que concluíram serviços.',
      es: '¡Sí! Todos los profesionales pasan por validación de identidad (documento oficial y registro) antes de ser activados. Además, cada profesional cuenta con un puntaje de Karma y opiniones auténticas de clientes que ya completaron trabajos con ellos.',
      en: 'Yes! All professionals undergo identity verification (official ID and background check) before being activated. Additionally, each professional has a Karma rating based on authentic reviews from real customers who completed services.'
    }
  },
  {
    id: 'c3',
    audience: 'client',
    question: {
      'pt-BR': 'Como é feito o pagamento do serviço?',
      es: '¿Cómo se realiza el pago del servicio?',
      en: 'How is the service payment processed?'
    },
    answer: {
      'pt-BR': 'O pagamento é feito diretamente ao profissional via Pix ou dinheiro após a conclusão e aprovação do serviço executado. Não cobramos mensalidades, assinaturas ou taxas ocultas de quem solicita serviços.',
      es: 'El pago se realiza directamente al profesional mediante Pix o efectivo una vez finalizado y aprobado el trabajo. No cobramos suscripciones ni cargos ocultos a quienes piden servicios.',
      en: 'Payment is made directly to the professional via Pix or cash once the service is completed and approved. We never charge subscription fees or hidden costs to clients requesting services.'
    }
  },
  {
    id: 'c4',
    audience: 'client',
    question: {
      'pt-BR': 'Posso cancelar ou reagendar um pedido após publicar?',
      es: '¿Puedo cancelar o reprogramar un pedido después de publicarlo?',
      en: 'Can I cancel or reschedule a request after posting?'
    },
    answer: {
      'pt-BR': 'Sim. Você pode cancelar seu pedido sem qualquer taxa a qualquer momento antes do início do atendimento, diretamente pela tela "Meus Pedidos" do seu painel.',
      es: 'Sí. Podés cancelar tu pedido sin costo en cualquier momento antes de que el profesional inicie el trabajo, directamente desde la sección "Mis pedidos" en tu panel.',
      en: 'Yes. You can cancel your request free of charge at any time before the service begins, right from the "My requests" tab in your dashboard.'
    }
  },
  {
    id: 'c5',
    audience: 'client',
    question: {
      'pt-BR': 'Como posso entrar em contato direto com o profissional?',
      es: '¿Cómo puedo contactar directamente al profesional?',
      en: 'How can I contact the professional directly?'
    },
    answer: {
      'pt-BR': 'Assim que o serviço é aceito ou ao visualizar o perfil no marketplace, você pode conversar com o profissional por telefone ou iniciar uma conversa instantânea pelo WhatsApp para tirar dúvidas e acertar detalhes.',
      es: 'Una vez asignado el pedido o al explorar perfiles en el marketplace, podés comunicarte por teléfono o abrir un chat directo por WhatsApp para coordinar detalles.',
      en: 'As soon as a service is assigned or when browsing profiles, you can reach out via phone or launch a direct WhatsApp conversation to coordinate details.'
    }
  },

  // --- Profissionais ---
  {
    id: 'p1',
    audience: 'pro',
    question: {
      'pt-BR': 'Como posso me cadastrar para atender clientes pelo UGO?',
      es: '¿Cómo puedo registrarme para atender clientes en UGO?',
      en: 'How can I sign up as a service provider on UGO?'
    },
    answer: {
      'pt-BR': 'Basta criar uma conta gratuita com a opção "Sou profissional", completar seus dados, enviar uma foto nítida do seu documento de identidade com foto e definir sua categoria principal e tarifa base. A análise é rápida e você já começa a receber propostas.',
      es: 'Solo tenés que crear una cuenta gratuita seleccionando "Soy profesional", completar tus datos, adjuntar tu documento de identidad y definir tu categoría principal y tarifa base. La revisión es ágil y enseguida podés empezar a recibir ofertas.',
      en: 'Simply create a free account selecting "I am a professional", fill in your details, submit an ID photo, and set your main specialty and base rate. Review is fast, and you will quickly start receiving nearby job offers.'
    }
  },
  {
    id: 'p2',
    audience: 'pro',
    question: {
      'pt-BR': 'Quanto custa para o profissional trabalhar com o UGO?',
      es: '¿Cuánto cuesta para el profesional trabajar con UGO?',
      en: 'How much does it cost for professionals to use UGO?'
    },
    answer: {
      'pt-BR': 'O cadastro e a manutenção do perfil são totalmente gratuitos. Não há mensalidade nem cobrança por visualizar oportunidades. O UGO só retém uma pequena comissão operacional transparente quando um trabalho é efetivamente concluído e recebido.',
      es: 'El registro y el mantenimiento de tu perfil son 100% gratuitos. No hay cuotas fijas ni cobros por ver oportunidades. UGO únicamente aplica una pequeña comisión transparente cuando completás y cobrás un trabajo exitoso.',
      en: 'Registration and profile maintenance are 100% free. There are no monthly fees or charges to view job leads. UGO only applies a small transparent platform fee when a job is successfully completed and paid.'
    }
  },
  {
    id: 'p3',
    audience: 'pro',
    question: {
      'pt-BR': 'Como recebo pedidos e como funciona o botão de disponibilidade?',
      es: '¿Cómo recibo pedidos y cómo funciona el botón de disponibilidad?',
      en: 'How do I receive job requests and how does the availability toggle work?'
    },
    answer: {
      'pt-BR': 'No seu painel profissional, ative a chave "Disponibilidade" para ficar online. Com o GPS habilitado, nosso sistema envia notificações instantâneas de novos chamados próximos à sua localização em tempo real, permitindo aceitar ou recusar cada trabalho com um toque.',
      es: 'En tu panel profesional, activá la opción "Disponibilidad" para figurar online. Con el GPS activo, el sistema te envía alertas inmediatas de pedidos cerca de tu ubicación actual, con total libertad para aceptar o rechazar.',
      en: 'In your pro dashboard, switch on "Availability" to go online. With GPS enabled, our system sends you instant notifications of nearby service requests in real time, letting you accept or decline each job with one tap.'
    }
  },
  {
    id: 'p4',
    audience: 'pro',
    question: {
      'pt-BR': 'Como funciona o sistema de Karma e reputação?',
      es: '¿Cómo funciona el sistema de Karma y reputación?',
      en: 'How does the Karma and reputation system work?'
    },
    answer: {
      'pt-BR': 'Cada atendimento realizado com pontualidade e avaliado positivamente com 5 estrelas eleva seu Karma. Profissionais com Karma mais alto ganham destaque nas buscas, aparecem em evidência no mapa e recebem prioridade no envio de novas oportunidades.',
      es: 'Cada trabajo realizado con puntualidad y calificado positivamente con 5 estrellas incrementa tu Karma. Los profesionales con mayor Karma tienen prioridad en el mapa interactivo y reciben antes las solicitudes de clientes.',
      en: 'Every service completed punctually and rated positively boosts your Karma. Professionals with higher Karma get highlighted pins on the map and receive priority for incoming customer service requests.'
    }
  },
  {
    id: 'p5',
    audience: 'pro',
    question: {
      'pt-BR': 'Como recebo o dinheiro dos serviços realizados?',
      es: '¿Cómo cobro el dinero de los servicios realizados?',
      en: 'How do I get paid for completed services?'
    },
    answer: {
      'pt-BR': 'O cliente paga diretamente a você no término do serviço, utilizando a sua chave Pix cadastrada ou dinheiro. Você tem total controle dos seus recebíveis sem intermediários retendo seus ganhos.',
      es: 'El cliente te abona directamente al finalizar el trabajo mediante tu clave Pix registrada o en efectivo. Vos tenés el control total de tus ingresos sin retenciones intermedias.',
      en: 'The customer pays you directly upon service completion using your registered Pix key or in cash. You maintain full control over your earnings with zero withholding delays.'
    }
  }
]

export default function FAQ() {
  const { t, locale } = useI18n()
  const [activeTab, setActiveTab] = useState<'all' | 'client' | 'pro'>('all')
  const [openIds, setOpenIds] = useState<string[]>(['c1', 'p1'])

  const toggleItem = (id: string) => {
    setOpenIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const filteredItems = FAQ_DATA.filter(item => {
    if (activeTab === 'all') return true
    return item.audience === activeTab
  })

  return (
    <section className="faq-section container" id="faq" aria-labelledby="faq-title">
      <div className="section-heading text-center">
        <div className="eyebrow">
          <Sparkles size={13} style={{ display: 'inline', marginRight: 6 }} />
          03 / TIRE SUAS DÚVIDAS
        </div>
        <h2 id="faq-title">{t('faqTitle')}</h2>
        <p>{t('faqSubtitle')}</p>
      </div>

      <div className="faq-tabs-row" role="tablist" aria-label="Filtro de perguntas">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`faq-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <HelpCircle size={15} />
          <span>{t('faqTabAll')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'client'}
          className={`faq-tab-btn ${activeTab === 'client' ? 'active' : ''}`}
          onClick={() => setActiveTab('client')}
        >
          <User size={15} />
          <span>{t('faqTabClients')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pro'}
          className={`faq-tab-btn ${activeTab === 'pro' ? 'active' : ''}`}
          onClick={() => setActiveTab('pro')}
        >
          <Briefcase size={15} />
          <span>{t('faqTabPros')}</span>
        </button>
      </div>

      <div className="faq-accordion" role="region" aria-label="Lista de perguntas frequentes">
        {filteredItems.map(item => {
          const isOpen = openIds.includes(item.id)
          const isClient = item.audience === 'client'
          const qText = item.question[locale] || item.question['pt-BR']
          const aText = item.answer[locale] || item.answer['pt-BR']

          return (
            <div key={item.id} className={`faq-card ${isOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="faq-question-btn"
                onClick={() => toggleItem(item.id)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${item.id}`}
                id={`faq-btn-${item.id}`}
              >
                <div className="faq-question-content">
                  <span className={`faq-badge ${isClient ? 'badge-client' : 'badge-pro'}`}>
                    {isClient ? t('faqBadgeClient') : t('faqBadgePro')}
                  </span>
                  <span className="faq-question-text">{qText}</span>
                </div>
                <span className={`faq-icon-wrap ${isOpen ? 'rotated' : ''}`} aria-hidden="true">
                  <ChevronDown size={18} />
                </span>
              </button>

              <div
                id={`faq-answer-${item.id}`}
                role="region"
                aria-labelledby={`faq-btn-${item.id}`}
                className={`faq-answer-collapse ${isOpen ? 'show' : ''}`}
              >
                <div className="faq-answer-inner">
                  <p>{aText}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
