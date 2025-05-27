const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../dbconfig');

// POST /matricula
router.post('/', async (req, res) => {
  const { estudianteID, cursoID } = req.body;

  if (!estudianteID || !cursoID) {
    return res.status(400).send('Faltan estudianteID o cursoID.');
  }

  try {
    await sql.connect(dbConfig);

    const check = await new sql.Request()
      .input('estudianteID', sql.Int, estudianteID)
      .input('cursoID', sql.Int, cursoID)
      .query(`
        SELECT MatriculaID FROM MatriculaCurso
        WHERE EstudianteID = @estudianteID AND CursoID = @cursoID
      `);

    if (check.recordset.length > 0) {
      return res.status(409).send('El estudiante ya está matriculado en este curso.');
    }

    await new sql.Request()
      .input('estudianteID', sql.Int, estudianteID)
      .input('cursoID', sql.Int, cursoID)
      .query(`
        INSERT INTO MatriculaCurso (EstudianteID, CursoID)
        VALUES (@estudianteID, @cursoID)
      `);

    res.status(201).send('Estudiante matriculado correctamente.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al matricular estudiante: ' + err.message);
  }
});

module.exports = router;