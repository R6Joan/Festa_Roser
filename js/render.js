// render.js → solo pinta la UI según el estado
function renderCard(card, data) {
  const btn = card.querySelector('.vote-btn');
  const count = card.querySelector('.vote-count');

  // Actualizar contador
  count.textContent = data.votes;

  // Clase votado/desvotado
  btn.classList.toggle('voted', data.voted);
}
