import { render } from 'preact';
import { audio } from '../audio/engine';
import { AdminApp } from './AdminApp';
import './admin.css';

/** Admin space: replaces the game page (no 3D scene). */
export function startAdmin(): void {
  document.getElementById('loader')?.remove();
  document.getElementById('scene')?.remove();
  document.title = 'Kiwar — admin';
  document.documentElement.classList.add('admin-page');
  audio.installUnlock();
  render(<AdminApp />, document.getElementById('ui')!);
}
