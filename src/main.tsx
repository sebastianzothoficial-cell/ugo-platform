import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18n } from './i18n'
import App from './App'
import './style.css'
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18n><App /></I18n></React.StrictMode>)
