const ESTADOS = ["A", "T", "F", "R"];

// Cargar cursos y asistencias al iniciar
document.addEventListener("DOMContentLoaded", () => {
  fetch("http://localhost:3000/cursos/1")
    .then(res => res.json())
    .then(cursos => {
      const select = document.getElementById("curso-select");
      cursos.forEach(curso => {
        const option = document.createElement("option");
        option.value = curso.CursoID;
        option.textContent = curso.NombreCurso;
        select.appendChild(option);
      });
      if (cursos.length > 0) {
        select.value = cursos[0].CursoID;
        cargarAsistencias(cursos[0].CursoID);
      }
    })
    .catch(err => console.error("Error al cargar cursos:", err));

  document.getElementById("curso-select").addEventListener("change", (e) => {
    const cursoID = e.target.value;
    cargarAsistencias(cursoID);
  });
});

function cargarAsistencias(cursoID) {
  fetch(`http://localhost:3000/asistencias/${cursoID}`)
    .then(res => res.json())
    .then(data => renderGrid(data))
    .catch(err => console.error("Error al cargar asistencias:", err));
}

function renderGrid(data) {
  const grid = document.getElementById("asistencia-grid");
  grid.innerHTML = "";

  const headers = ["Nombre"].concat([...Array(16).keys()].map(i => `S${i + 1}`));
  headers.forEach(header => {
    const cell = document.createElement("div");
    cell.textContent = header;
    cell.className = "grid-header";
    grid.appendChild(cell);
  });

  data.forEach(est => {
    const filaRetirado = est.asistencias.includes("R");
    const nameCell = document.createElement("div");
    nameCell.textContent = est.nombre + (filaRetirado ? " (Retirado)" : "");
    nameCell.classList.add(filaRetirado ? "retirado" : "activo");
    grid.appendChild(nameCell);

    est.asistencias.forEach((estado, semanaIndex) => {
      const cell = document.createElement("div");
      cell.textContent = estado;
      cell.className = `estado-${estado}`;
      cell.dataset.estado = estado;
      cell.dataset.matriculaID = est.matriculaID;
      cell.dataset.semana = semanaIndex + 1;

      if (!filaRetirado) {
        cell.addEventListener("click", () => {
          const current = cell.dataset.estado;
          const next = ESTADOS[(ESTADOS.indexOf(current) + 1) % ESTADOS.length];
          cell.textContent = next;
          cell.className = `estado-${next}`;
          cell.dataset.estado = next;

          fetch("http://localhost:3000/asistencias", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              matriculaID: parseInt(cell.dataset.matriculaID),
              semana: parseInt(cell.dataset.semana),
              estado: next
            })
          })
            .then(res => res.text())
            .then(msg => {
              console.log(msg);
              mostrarToast("Guardado");
            })
            .catch(err => {
              console.error("Error al guardar:", err);
              mostrarToast("Error al guardar");
            });
        });
      } else {
        cell.classList.add("retirado");
      }

      grid.appendChild(cell);
    });
  });
}

function mostrarToast(msg) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.backgroundColor = "#333";
  toast.style.color = "#fff";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "8px";
  toast.style.opacity = "0.9";
  toast.style.zIndex = "9999";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}