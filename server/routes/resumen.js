const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../dbconfig');

router.get('/:cursoID', async (req, res) => {
  const { cursoID } = req.params;

  try {
    await sql.connect(dbConfig);

    const result = await sql.query(`
      SELECT 
        E.Nombre,
        M.MatriculaID,
        A.Estado
      FROM MatriculaCurso M
      JOIN Estudiante E ON M.EstudianteID = E.EstudianteID
      LEFT JOIN Asistencia A ON M.MatriculaID = A.MatriculaID
      WHERE M.CursoID = ${cursoID}
    `);

    const resumen = {};

    for (const row of result.recordset) {
      const id = row.MatriculaID;
      if (!resumen[id]) {
        resumen[id] = {
          nombre: row.Nombre,
          matriculaID: id,
          A: 0,
          T: 0,
          F: 0,
          R: 0,
          puntos: 0
        };
      }

      switch (row.Estado) {
        case 'A':
          resumen[id].A++;
          resumen[id].puntos += 1;
          break;
        case 'T':
          resumen[id].T++;
          resumen[id].puntos += 0.5;
          break;
        case 'F':
          resumen[id].F++;
          break;
        case 'R':
          resumen[id].R++;
          break;
      }
    }

    res.json(Object.values(resumen));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al generar resumen: ' + err.message);
  }
});

module.exports = router;