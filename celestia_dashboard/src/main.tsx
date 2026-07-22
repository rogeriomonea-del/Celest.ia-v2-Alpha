import React from 'react'
import ReactDOM from 'react-dom/client'
// Fontes premium self-hosted (sem requisição externa): Fraunces (serifa de
// exibição) para títulos/preços e Inter para o corpo.
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
