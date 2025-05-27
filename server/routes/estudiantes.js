const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../dbconfig');

// POST /estudiantes
router.post('/', async (req, res) => {
  const { nombre, matricula } = req.body;

  if (!nombre || !matricula) {
    return res.status(400).send('Faltan datos: nombre y matrícula son requeridos.');
  }

  try {
    await sql.connect(dbConfig);

    const check = await new sql.Request()
      .input('matricula', sql.VarChar, matricula)
      .query(`SELECT EstudianteID FROM Estudiante WHERE Matricula = @matricula`);

    if (check.recordset.length > 0) {
      return res.status(409).send('La matrícula ya está registrada.');
    }

    await new sql.Request()
      .input('nombre', sql.VarChar, nombre)
      .input('matricula', sql.VarChar, matricula)
      .query(`INSERT INTO Estudiante (Nombre, Matricula) VALUES (@nombre, @matricula)`);

    res.status(201).send('Estudiante registrado correctamente.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al registrar estudiante: ' + err.message);
  }
});

// GET /estudiantes
router.get('/', async (req, res) => {
  try {
    await sql.connect(dbConfig);

    const result = await sql.query(`SELECT EstudianteID, Nombre FROM Estudiante ORDER BY Nombre`);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener estudiantes: ' + err.message);
  }
});

module.exports = router;
