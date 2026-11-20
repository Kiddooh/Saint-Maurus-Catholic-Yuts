import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
