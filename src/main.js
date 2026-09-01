import './styles.css'
import { Game } from './game.js'
import * as portal from './portal.js'

portal.loadingStart()
portal.wireAudio()
portal.fitTopInset()

const boot = () => {
  window.__climb = new Game()
  portal.loadingStop()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
