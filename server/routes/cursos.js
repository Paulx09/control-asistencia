const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../dbconfig');

router.get('/:docenteID', async (req, res) => {
  const { docenteID } = req.params;

  try {
    await sql.connect(dbConfig);
    const result = await sql.query(`
      SELECT CursoID, NombreCurso
      FROM Curso
      WHERE DocenteID = ${docenteID}
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al consultar cursos: ' + err.message);
  }
});

module.exports = router;