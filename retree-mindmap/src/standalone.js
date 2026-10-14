import {mountTree} from './app.js';
mountTree(document.querySelector('#main'));
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();document.querySelector('#main').focus();});
