import './style.css';
import { initGallery } from './gallery.ts';
import { initEditor } from './editor.ts';

const galleryStage = document.querySelector<HTMLElement>('#gallery-stage');
const layoutButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.layout-toggle .toggle-option'));
if (galleryStage) initGallery(galleryStage, layoutButtons);

initEditor();

document.querySelector<HTMLButtonElement>('#make-yours-btn')?.addEventListener('click', () => {
  document.querySelector('#editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
