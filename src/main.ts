import './style.css';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('#app container missing');
new Game(app);
