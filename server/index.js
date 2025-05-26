const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const dbConfig = require('../dbconfig');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/asistencias/:cursoID', async (req, res) => {
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

app.put('/asistencias', async (req, res) => {
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

app.get('/cursos/:docenteID', async (req, res) => {
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

app.post('/estudiantes', async (req, res) => {
  const { nombre, matricula } = req.body;

  if (!nombre || !matricula) {
    return res.status(400).send('Faltan datos: nombre y matrícula son requeridos.');
  }

  try {
    await sql.connect(dbConfig);

    const check = await sql.query(`
      SELECT EstudianteID FROM Estudiante WHERE Matricula = '${matricula}'
    `);

    if (check.recordset.length > 0) {
      return res.status(409).send('La matrícula ya está registrada.');
    }

    await sql.query(`
      INSERT INTO Estudiante (Nombre, Matricula)
      VALUES ('${nombre}', '${matricula}')
    `);

    res.status(201).send('Estudiante registrado correctamente.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al registrar estudiante: ' + err.message);
  }
});

app.get('/estudiantes', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    
    const result = await sql.query(`
      SELECT EstudianteID, Nombre FROM Estudiante ORDER BY Nombre
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener estudiantes: ' + err.message);
  }
});

app.post('/matricula', async (req, res) => {
  const { estudianteID, cursoID } = req.body;

  if (!estudianteID || !cursoID) {
    return res.status(400).send('Faltan estudianteID o cursoID.');
  }

  try {
    await sql.connect(dbConfig);

    const check = await sql.query(`
      SELECT MatriculaID FROM MatriculaCurso
      WHERE EstudianteID = ${estudianteID} AND CursoID = ${cursoID}
    `);

    if (check.recordset.length > 0) {
      return res.status(409).send('El estudiante ya está matriculado en este curso.');
    }

    await sql.query(`
      INSERT INTO MatriculaCurso (EstudianteID, CursoID)
      VALUES (${estudianteID}, ${cursoID})
    `);

    res.status(201).send('Estudiante matriculado correctamente.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al matricular estudiante: ' + err.message);
  }
});

app.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));
