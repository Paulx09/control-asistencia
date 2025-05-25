const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const dbConfig = require('../dbconfig');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/asistencias/:cursoID', async (req, res) => {
  const { cursoID } = req.params;
  try {
    await sql.connect(dbConfig);
    const result = await sql.query(`
      SELECT E.Nombre AS nombre, A.Semana, A.Estado
      FROM Asistencia A
      JOIN MatriculaCurso M ON A.MatriculaID = M.MatriculaID
      JOIN Estudiante E ON M.EstudianteID = E.EstudianteID
      WHERE M.CursoID = ${cursoID}
      ORDER BY E.Nombre, A.Semana
    `);

    // Agrupar por estudiante
    const grouped = {};
    for (const row of result.recordset) {
      if (!grouped[row.nombre]) {
        grouped[row.nombre] = Array(16).fill('');
      }
      grouped[row.nombre][row.Semana - 1] = row.Estado;
    }

    const formatted = Object.entries(grouped).map(([nombre, asistencias]) => ({
      nombre, asistencias
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).send('Error al consultar asistencias: ' + err.message);
  }
});

app.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));
