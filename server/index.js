const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const dbConfig = require('./dbconfig');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/utils', express.static(path.join(__dirname, '../utils')));

// Static frontend
app.use(express.static('public'));

// Conexión a BD
sql.connect(dbConfig);

// Rutas modularizadas
app.use('/asistencias', require('./routes/asistencias'));
app.use('/estudiantes', require('./routes/estudiantes'));
app.use('/cursos', require('./routes/cursos'));
app.use('/matricula', require('./routes/matriculas'));
app.use('/resumen', require('./routes/resumen'));

// Levantar servidor
app.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));
