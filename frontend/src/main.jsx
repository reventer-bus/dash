import { createRoot } from 'react-dom/client'
import './index.css'
import './auth.js'  // installs the Bearer-token fetch interceptor
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
