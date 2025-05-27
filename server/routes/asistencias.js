const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../dbconfig');

// GET /asistencias/:cursoID
router.get('/:cursoID', async (req, res) => { 
  const { cursoID } = req.params;
  try {
    await sql.connect(dbConfig);

    const result = await sql.query(`
      SELECT 
        E.Nombre AS nombre,
        M.MatriculaID,
        A.Semana,
        A.Estado
      FROM MatriculaCurso M
      JOIN Estudiante E ON M.EstudianteID = E.EstudianteID
      LEFT JOIN Asistencia A ON A.MatriculaID = M.MatriculaID
      WHERE M.CursoID = ${cursoID}
      ORDER BY M.MatriculaID, A.Semana
    `);

    const grouped = {};
    for (const row of result.recordset) {
      const key = row.MatriculaID;
      if (!grouped[key]) {
        grouped[key] = {
          nombre: row.nombre,
          matriculaID: row.MatriculaID,
          asistencias: Array(16).fill('')
        };
      }
      if (row.Semana) {
        grouped[key].asistencias[row.Semana - 1] = row.Estado;
      }
    }

    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al consultar asistencias: ' + err.message);
  }
});

// PUT /asistencias
router.put('/', async (req, res) => {
  const { matriculaID, semana, estado } = req.body;

  if (!matriculaID || !semana || !estado) {
    return res.status(400).send('Faltan campos requeridos.');
  }

  try {
    await sql.connect(dbConfig);

    const request = new sql.Request();
    request.input('matriculaID', sql.Int, matriculaID);
    request.input('semana', sql.Int, semana);
    request.input('estado', sql.Char, estado);

    const cursoRes = await request.query(`
      SELECT CursoID FROM MatriculaCurso WHERE MatriculaID = @matriculaID
    `);
    if (cursoRes.recordset.length === 0) return res.status(404).send('Curso no encontrado.');
    const cursoID = cursoRes.recordset[0].CursoID;

    const fechaRes = await new sql.Request()
      .input('cursoID', sql.Int, cursoID)
      .input('semana', sql.Int, semana)
      .query(`SELECT Fecha FROM SemanaCurso WHERE CursoID = @cursoID AND NumeroSemana = @semana`);
    if (fechaRes.recordset.length === 0) return res.status(404).send('Fecha no encontrada.');
    const fechaClase = fechaRes.recordset[0].Fecha;

    const existe = await new sql.Request()
      .input('matriculaID', sql.Int, matriculaID)
      .input('semana', sql.Int, semana)
      .query(`SELECT 1 FROM Asistencia WHERE MatriculaID = @matriculaID AND Semana = @semana`);

    if (existe.recordset.length > 0) {
      await new sql.Request()
        .input('estado', sql.Char, estado)
        .input('fechaClase', sql.Date, fechaClase)
        .input('matriculaID', sql.Int, matriculaID)
        .input('semana', sql.Int, semana)
        .query(`
          UPDATE Asistencia SET Estado = @estado, FechaClase = @fechaClase
          WHERE MatriculaID = @matriculaID AND Semana = @semana
        `);
    } else {
      await new sql.Request()
        .input('matriculaID', sql.Int, matriculaID)
        .input('semana', sql.Int, semana)
        .input('estado', sql.Char, estado)
        .input('fechaClase', sql.Date, fechaClase)
        .query(`
          INSERT INTO Asistencia (MatriculaID, Semana, Estado, FechaClase)
          VALUES (@matriculaID, @semana, @estado, @fechaClase)
        `);
    }

    if (estado === 'R') {
      await new sql.Request()
        .input('matriculaID', sql.Int, matriculaID)
        .input('fechaClase', sql.Date, fechaClase)
        .query(`
          UPDATE MatriculaCurso SET FechaRetiro = @fechaClase
          WHERE MatriculaID = @matriculaID
        `);

      for (let sem = semana + 1; sem <= 16; sem++) {
        const futureFecha = await new sql.Request()
          .input('cursoID', sql.Int, cursoID)
          .input('semana', sql.Int, sem)
          .query(`SELECT Fecha FROM SemanaCurso WHERE CursoID = @cursoID AND NumeroSemana = @semana`);
        if (futureFecha.recordset.length === 0) continue;
        const fecha = futureFecha.recordset[0].Fecha;

        const existe = await new sql.Request()
          .input('matriculaID', sql.Int, matriculaID)
          .input('semana', sql.Int, sem)
          .query(`SELECT 1 FROM Asistencia WHERE MatriculaID = @matriculaID AND Semana = @semana`);

        if (existe.recordset.length > 0) {
          await new sql.Request()
            .input('estado', sql.Char, 'R')
            .input('fechaClase', sql.Date, fecha)
            .input('matriculaID', sql.Int, matriculaID)
            .input('semana', sql.Int, sem)
            .query(`
              UPDATE Asistencia SET Estado = @estado, FechaClase = @fechaClase
              WHERE MatriculaID = @matriculaID AND Semana = @semana
            `);
        } else {
          await new sql.Request()
            .input('matriculaID', sql.Int, matriculaID)
            .input('semana', sql.Int, sem)
            .input('estado', sql.Char, 'R')
            .input('fechaClase', sql.Date, fecha)
            .query(`
              INSERT INTO Asistencia (MatriculaID, Semana, Estado, FechaClase)
              VALUES (@matriculaID, @semana, @estado, @fechaClase)
            `);
        }
      }
    }

    const faltas = await new sql.Request()
      .input('matriculaID', sql.Int, matriculaID)
      .query(`SELECT COUNT(*) AS total FROM Asistencia WHERE MatriculaID = @matriculaID AND Estado = 'F'`);

    if (faltas.recordset[0].total >= 3) {
      const retiro = await new sql.Request()
        .input('matriculaID', sql.Int, matriculaID)
        .query(`
          SELECT Semana, FechaClase FROM (
            SELECT Semana, FechaClase, ROW_NUMBER() OVER (ORDER BY Semana) AS rn
            FROM Asistencia
            WHERE MatriculaID = @matriculaID AND Estado = 'F'
          ) AS sub
          WHERE rn = 3
        `);

      if (retiro.recordset.length > 0) {
        const semanaRetiro = retiro.recordset[0].Semana;
        const fechaRetiro = retiro.recordset[0].FechaClase;

        await new sql.Request()
          .input('matriculaID', sql.Int, matriculaID)
          .input('fechaRetiro', sql.Date, fechaRetiro)
          .query(`UPDATE MatriculaCurso SET FechaRetiro = @fechaRetiro WHERE MatriculaID = @matriculaID`);

        for (let sem = semanaRetiro + 1; sem <= 16; sem++) {
          const futureFecha = await new sql.Request()
            .input('cursoID', sql.Int, cursoID)
            .input('semana', sql.Int, sem)
            .query(`SELECT Fecha FROM SemanaCurso WHERE CursoID = @cursoID AND NumeroSemana = @semana`);
          if (futureFecha.recordset.length === 0) continue;
          const fecha = futureFecha.recordset[0].Fecha;

          const existe = await new sql.Request()
            .input('matriculaID', sql.Int, matriculaID)
            .input('semana', sql.Int, sem)
            .query(`SELECT 1 FROM Asistencia WHERE MatriculaID = @matriculaID AND Semana = @semana`);

          if (existe.recordset.length > 0) {
            await new sql.Request()
              .input('estado', sql.Char, 'R')
              .input('fechaClase', sql.Date, fecha)
              .input('matriculaID', sql.Int, matriculaID)
              .input('semana', sql.Int, sem)
              .query(`
                UPDATE Asistencia SET Estado = @estado, FechaClase = @fechaClase
                WHERE MatriculaID = @matriculaID AND Semana = @semana
              `);
          } else {
            await new sql.Request()
              .input('matriculaID', sql.Int, matriculaID)
              .input('semana', sql.Int, sem)
              .input('estado', sql.Char, 'R')
              .input('fechaClase', sql.Date, fecha)
              .query(`
                INSERT INTO Asistencia (MatriculaID, Semana, Estado, FechaClase)
                VALUES (@matriculaID, @semana, @estado, @fechaClase)
              `);
          }
        }
      }
    }

    res.send('✅ Asistencia registrada con lógica de retiro.');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Error al procesar asistencia: ' + err.message);
  }
});

module.exports = router;