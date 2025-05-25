// Cargar datos simulados desde data.json
document.addEventListener("DOMContentLoaded", () => {
  fetch("data.json")
    .then(res => res.json())
    .then(data => renderGrid(data));
});

function renderGrid(data) {
  const grid = document.getElementById("asistencia-grid");
  grid.innerHTML = "";

  // Encabezados
  const headers = ["Nombre"].concat([...Array(16).keys()].map(i => `S${i + 1}`));
  headers.forEach(header => {
    const cell = document.createElement("div");
    cell.textContent = header;
    cell.className = "grid-header";
    grid.appendChild(cell);
  });

  // Filas por estudiante
  data.forEach(est => {
    const nameCell = document.createElement("div");
    nameCell.textContent = est.nombre;
    grid.appendChild(nameCell);

    est.asistencias.forEach(estado => {
      const cell = document.createElement("div");
      cell.textContent = estado;
      cell.classList.add(`estado-${estado}`);
      grid.appendChild(cell);
    });
  });
}