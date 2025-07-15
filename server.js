const express = require('express');
const path = require('path');
const fs = require('fs');
// const mysql = require('mysql2/promise');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 10000; // Aseguramos que use el puerto 10000 como en Render

// Configuración de CORS
const allowedOrigins = [
  'https://sistema-policial-nuevo.onrender.com',
  'https://sistema-policial.onrender.com',
  'http://localhost:8080',
  'http://localhost:10000'
];

// Configuración CORS mejorada
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como aplicaciones móviles o curl)
    if (!origin) return callback(null, true);
    
    // Verificar si el origen está en la lista blanca
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `El origen ${origin} no tiene permiso de acceso.`;
      console.warn('Intento de acceso desde origen no permitido:', origin);
      return callback(new Error(msg), false);
    }
    
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 600, // 10 minutos de caché para preflight
  optionsSuccessStatus: 200 // Algunos clientes necesitan 200 en lugar de 204
};

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));

// Manejar solicitudes OPTIONS (preflight) para todas las rutas
app.options('*', cors(corsOptions));

// Middleware de registro para depuración
app.use((req, res, next) => {
  console.log('\n=== Nueva Solicitud ===');
  console.log(`Método: ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Registrar el body para métodos POST, PUT, PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  
  // Registrar archivos subidos
  if (req.file) {
    console.log('Archivo subido:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  }
  
  // Continuar con el siguiente middleware
  next();
});

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Cargar variables de entorno
require('dotenv').config();

// Configuración de la conexión a PostgreSQL
const poolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:wnwX96YVvGqhXghRH2hCdfHQFGn82nm8@dpg-d1o234odl3ps73fn3v4g-a.oregon-postgres.render.com:5432/sistema_policial',
  ssl: {
    rejectUnauthorized: false,  // Necesario para Render PostgreSQL
    sslmode: 'require'          // Forzar el uso de SSL
  },
  // Configuración del pool de conexiones
  max: 20,                      // Número máximo de clientes en el pool
  min: 2,                       // Número mínimo de clientes en el pool
  idleTimeoutMillis: 30000,      // Tiempo máximo que un cliente puede permanecer inactivo en el pool
  connectionTimeoutMillis: 10000, // Tiempo máximo para establecer una nueva conexión
  application_name: 'sistema-policial-api', // Identificador de la aplicación
  // Manejo de reconexión
  retry: {
    max: 3,                     // Número máximo de intentos de reconexión
    backoff: 1000               // Tiempo de espera entre intentos (en ms)
  },
  // Timeouts
  query_timeout: 15000,          // 15 segundos de tiempo de espera por consulta
  statement_timeout: 15000,      // 15 segundos de tiempo de espera por sentencia
  // Manejo de conexiones inactivas
  idle_in_transaction_session_timeout: 30000, // 30 segundos para transacciones inactivas
  // Configuración de KeepAlive
  keepalives: 1,                // Habilitar keepalive
  keepalives_idle: 10000,        // 10 segundos de inactividad antes de enviar keepalive
  keepalives_interval: 10000,    // 10 segundos entre keepalives
  keepalives_count: 3            // Número de keepalives perdidos antes de marcar la conexión como muerta
};

console.log('Configuración de la base de datos:', {
  ...poolConfig,
  connectionString: poolConfig.connectionString ? '***CONNECTION STRING SET***' : 'NO CONNECTION STRING'
});

const pool = new Pool(poolConfig);

// Manejar eventos de error en el pool
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de conexiones:', err);
  // No es necesario terminar el proceso aquí, el pool se encargará de reconectar
});

// Función para probar la conexión a la base de datos
async function testDatabaseConnection() {
  let client;
  const startTime = Date.now();
  
  try {
    console.log('Intentando conectar a la base de datos...');
    console.log('Host:', poolConfig.connectionString.split('@')[1].split('/')[0]);
    console.log('Base de datos:', poolConfig.connectionString.split('/').pop().split('?')[0]);
    
    // Intentar conectar
    client = await pool.connect();
    const connectTime = Date.now() - startTime;
    
    // Ejecutar una consulta de prueba
    const queryStart = Date.now();
    const result = await client.query('SELECT NOW() as hora_servidor, current_database() as nombre_bd, version() as version_pg');
    const queryTime = Date.now() - queryStart;
    
    console.log('✅ Conexión a la base de datos exitosa:');
    console.log(`- Tiempo de conexión: ${connectTime}ms`);
    console.log(`- Tiempo de consulta: ${queryTime}ms`);
    console.log('- Información de la base de datos:');
    console.log(`  - Hora del servidor: ${result.rows[0].hora_servidor}`);
    console.log(`  - Base de datos: ${result.rows[0].nombre_bd}`);
    console.log(`  - Versión de PostgreSQL: ${result.rows[0].version_pg.split(',')[0]}`);
    
    return true;
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error('❌ Error al conectar a la base de datos:');
    console.error(`- Tiempo transcurrido: ${errorTime}ms`);
    console.error('- Código de error:', error.code);
    console.error('- Mensaje:', error.message);
    
    if (error.code === 'ETIMEDOUT') {
      console.error('- Problema: Tiempo de espera agotado al intentar conectar al servidor de base de datos');
      console.error('- Solución: Verifica que la URL de conexión sea correcta y que el servidor esté en línea');
    } else if (error.code === 'ENOTFOUND') {
      console.error('- Problema: No se pudo resolver el nombre del host de la base de datos');
      console.error('- Solución: Verifica la configuración de red y el nombre del host');
    } else if (error.code === '3D000') {
      console.error('- Problema: La base de datos especificada no existe');
      console.error('- Solución: Verifica el nombre de la base de datos en la URL de conexión');
    } else if (error.code === '28P01') {
      console.error('- Problema: Error de autenticación');
      console.error('- Solución: Verifica el nombre de usuario y la contraseña en la URL de conexión');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('- Problema: Conexión rechazada por el servidor');
      console.error('- Solución: Verifica que el servidor PostgreSQL esté en ejecución y aceptando conexiones');
    }
    
    return false;
  } finally {
    if (client) {
      try {
        await client.release();
      } catch (releaseError) {
        console.error('Error al liberar la conexión:', releaseError);
      }
    }
  }
}

// Probar la conexión al iniciar el servidor
testDatabaseConnection().then(success => {
  if (!success) {
    console.error('No se pudo conectar a la base de datos. Verifica la configuración.');
  }
});

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10MB
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de archivos estáticos
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta para guardar un nuevo oficial
app.post('/api/oficiales', upload.single('pdfFile'), async (req, res) => {
    console.log('=== Nueva solicitud POST a /api/oficiales ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Archivo:', req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    } : 'Ningún archivo recibido');
    
    // Verificar si hay un archivo
    if (!req.file) {
        const error = 'No se recibió ningún archivo';
        console.error(error);
        return res.status(400).json({ 
            success: false, 
            message: 'Por favor, suba un archivo PDF válido',
            error: error
        });
    }
    
    // Verificar que el archivo sea un PDF
    if (req.file.mimetype !== 'application/pdf') {
        const error = `Tipo de archivo no permitido: ${req.file.mimetype}`;
        console.error(error);
        return res.status(400).json({
            success: false,
            message: 'Solo se permiten archivos PDF',
            error: error
        });
    }
    
    let connection;
    
    // Validar campos requeridos antes de obtener una conexión
    const camposRequeridos = [
        'nombreCompleto', 'curp', 'cuip', 'cup', 'edad', 'sexo', 'estadoCivil',
        'areaAdscripcion', 'grado', 'cargoActual', 'fechaIngreso',
        'escolaridad', 'telefonoContacto', 'telefonoEmergencia', 'funcion'
    ];

    // Validar que todos los campos requeridos estén presentes
    const camposFaltantes = [];
    const camposInvalidos = [];
    
    for (const campo of camposRequeridos) {
        if (req.body[campo] === undefined || req.body[campo] === null || req.body[campo].trim() === '') {
            camposFaltantes.push(campo);
        } else if (typeof req.body[campo] === 'string') {
            req.body[campo] = req.body[campo].trim();
        }
    }

    if (camposFaltantes.length > 0) {
        const error = `Faltan campos requeridos: ${camposFaltantes.join(', ')}`;
        console.error(error);
        return res.status(400).json({
            success: false,
            message: 'Por favor complete todos los campos requeridos',
            error: error,
            camposFaltantes: camposFaltantes
        });
    }
    
    try {
        // Obtener una conexión del pool con timeout
        connection = await pool.connect();
        console.log('Conexión a la base de datos establecida');
        
        // Iniciar transacción
        await connection.query('BEGIN');
        console.log('Transacción iniciada');
        
        // Verificar conexión a la base de datos
        try {
            const testResult = await connection.query('SELECT NOW() as current_time');
            console.log('Conexión a la base de datos exitosa. Hora del servidor:', testResult.rows[0].current_time);
        } catch (dbError) {
            console.error('Error al conectar a la base de datos:', dbError);
            throw new Error('No se pudo conectar a la base de datos');
        }

        // Validar formato de la CURP
        const curp = req.body.curp.trim().toUpperCase();
        
        // Expresión regular para validar el formato de la CURP
        const curpRegex = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/;
        
        // Verificar longitud exacta de 18 caracteres
        if (curp.length !== 18) {
            return res.status(400).json({
                success: false,
                message: 'Longitud de CURP incorrecta',
                error: `La CURP debe tener exactamente 18 caracteres (tiene ${curp.length})`,
                valorRecibido: curp,
                ejemploValido: 'XAXX010101HDFABC01',
                estructura: '4 letras + 6 números + H/M + 5 letras + 1 letra/número + 1 número'
            });
        }
        
        // Verificar formato con expresión regular
        if (!curpRegex.test(curp)) {
            // Analizar qué parte del formato es incorrecta
            let errorDetalle = 'Formato general incorrecto';
            
            // Verificar primeros 4 caracteres (letras)
            if (!/^[A-Z]{4}/.test(curp)) {
                errorDetalle = 'Los primeros 4 caracteres deben ser letras (iniciales de nombres y apellidos)';
            } 
            // Verificar siguiente bloque de 6 números (fecha de nacimiento)
            else if (!/^[A-Z]{4}[0-9]{6}/.test(curp)) {
                errorDetalle = 'Los caracteres 5-10 deben ser números (fecha de nacimiento AAMMDD)';
            }
            // Verificar sexo (H o M)
            else if (!/^[A-Z]{4}[0-9]{6}[HM]/.test(curp)) {
                errorDetalle = 'El carácter 11 debe ser H (hombre) o M (mujer)';
            }
            // Verificar los siguientes 5 caracteres (lugar de nacimiento)
            else if (!/^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}/.test(curp)) {
                errorDetalle = 'Los caracteres 12-16 deben ser letras (lugar de nacimiento)';
            }
            // Verificar los últimos 2 caracteres (homoclave)
            else if (!/^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/.test(curp)) {
                errorDetalle = 'Los últimos 2 caracteres deben ser alfanuméricos (homoclave)';
            }
            
            console.error('Formato de CURP inválido:', curp);
            return res.status(400).json({
                success: false,
                message: 'Formato de CURP inválido',
                error: errorDetalle,
                valorRecibido: curp,
                ejemploValido: 'XAXX010101HDFABC01',
                estructura: '4 letras (iniciales) + 6 números (AAMMDD) + H/M (sexo) + 5 letras (lugar) + 1 letra/número + 1 número',
                nota: 'La CURP debe seguir el formato oficial de 18 caracteres alfanuméricos',
                formatoEsperado: {
                    posiciones: '1-4: Letras (iniciales)',
                    fechaNacimiento: '5-10: Números (AAMMDD)',
                    sexo: '11: H o M',
                    lugarNacimiento: '12-16: Letras (lugar)',
                    homoclave: '17-18: Alfanumérico (homoclave)'
                }
            });
        }
        
        // Validar que la CURP no contenga palabras ofensivas
        const palabrasProhibidas = ['BUEI', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO', 'COGE', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO', 'FALO', 'FETO', 'GETA', 'GUEY', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA', 'KAKO', 'KOGE', 'KOJO', 'KAKA', 'KULO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MION', 'MOCO', 'MULA', 'PEDA', 'PEDO', 'PENE', 'PIPI', 'PITO', 'POPO', 'PUTA', 'PUTO', 'QULO', 'RATA', 'RUIN'];
        const primerasCuatroLetras = curp.substring(0, 4);
        
        if (palabrasProhibidas.includes(primerasCuatroLetras)) {
            console.error('CURP contiene palabra prohibida:', primerasCuatroLetras);
            return res.status(400).json({
                success: false,
                message: 'CURP no válida',
                error: 'Las primeras cuatro letras de la CURP no son válidas',
                motivo: 'Contiene una combinación no permitida',
                valorRecibido: curp
            });
        }

        // Validar que la edad sea un número válido
        const edad = parseInt(req.body.edad, 10);
        if (isNaN(edad) || edad < 18 || edad > 100) {
            throw new Error('La edad debe ser un número entre 18 y 100');
        }

        // Validar formato de fecha
        const fechaIngreso = new Date(req.body.fechaIngreso);
        if (isNaN(fechaIngreso.getTime())) {
            throw new Error('El formato de fecha debe ser YYYY-MM-DD');
        }
        
        // Validar que la fecha no sea futura
        const hoy = new Date();
        if (fechaIngreso > hoy) {
            throw new Error('La fecha de ingreso no puede ser futura');
        }

        // Limpiar y validar números de teléfono
        const limpiarTelefono = (telefono) => {
            if (!telefono) return null;
            const soloNumeros = telefono.replace(/\D/g, '');
            if (soloNumeros.length < 10) {
                throw new Error('El número de teléfono debe tener al menos 10 dígitos');
            }
            return soloNumeros;
        };
        
        const telefonoContacto = limpiarTelefono(req.body.telefonoContacto);
        const telefonoEmergencia = limpiarTelefono(req.body.telefonoEmergencia);

        // Crear objeto con los datos del oficial
        const oficialData = {
            nombre_completo: req.body.nombreCompleto.trim(),
            curp: curp, // Usamos la CURP ya validada
            cuip: req.body.cuip ? req.body.cuip.trim() : null,
            cup: req.body.cup ? req.body.cup.trim() : null,
            edad: edad,
            sexo: req.body.sexo.trim(),
            estado_civil: req.body.estadoCivil.trim(),
            area_adscripcion: req.body.areaAdscripcion.trim(),
            grado: req.body.grado.trim(),
            cargo_actual: req.body.cargoActual.trim(),
            fecha_ingreso: req.body.fechaIngreso,
            escolaridad: req.body.escolaridad.trim(),
            telefono_contacto: telefonoContacto,
            telefono_emergencia: telefonoEmergencia,
            funcion: req.body.funcion.trim(),
            pdf_nombre_archivo: req.file.filename,
            pdf_tipo: req.file.mimetype,
            pdf_tamanio: req.file.size,
            usuario_registro: 1, // ID del usuario administrador
            activo: 1,
            fecha_registro: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };

        console.log('Datos del oficial a insertar:', JSON.stringify(oficialData, null, 2));
        
        // Verificar si ya existe un registro con la misma CURP, CUIP o CUP
        try {
            const query = 'SELECT id, curp, cuip, cup FROM oficiales WHERE curp = $1 OR cuip = $2 OR cup = $3';
            const values = [oficialData.curp, oficialData.cuip, oficialData.cup];
            console.log('Verificando duplicados con:', { query, values });
            
            const existing = await connection.query(query, values);
            
            if (existing.rows && existing.rows.length > 0) {
                const duplicados = [];
                existing.rows.forEach(row => {
                    if (row.curp === oficialData.curp) duplicados.push(`CURP: ${row.curp}`);
                    if (row.cuip && row.cuip === oficialData.cuip) duplicados.push(`CUIP: ${row.cuip}`);
                    if (row.cup && row.cup === oficialData.cup) duplicados.push(`CUP: ${row.cup}`);
                });
                
                const errorMsg = `Ya existe un registro con: ${duplicados.join(', ')}`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Error al verificar duplicados:', error);
            throw error; // Relanzar para que lo maneje el catch externo
        }

        // Insertar el nuevo registro
        try {
            console.log('Insertando nuevo registro...');
            const columns = Object.keys(oficialData).join(', ');
            const placeholders = Object.keys(oficialData).map((_, i) => `$${i + 1}`).join(', ');
            const values = Object.values(oficialData);
            const query = `INSERT INTO oficiales (${columns}) VALUES (${placeholders}) RETURNING id`;
            
            console.log('Query de inserción:', query);
            console.log('Valores:', values);
            
            const result = await connection.query(query, values);
            console.log('Resultado de la inserción:', result.rows[0]);
            
            if (!result.rows || result.rows.length === 0) {
                throw new Error('No se pudo obtener el ID del registro insertado');
            }
            
            // Confirmar la transacción
            await connection.query('COMMIT');
            console.log('Transacción confirmada');
            
            const nuevoId = result.rows[0].id;
            console.log('Registro insertado correctamente. ID:', nuevoId);
            
            // Enviar respuesta exitosa
            return res.status(201).json({ 
                success: true, 
                message: 'Oficial registrado exitosamente',
                data: {
                    id: nuevoId,
                    ...oficialData
                }
            });
            
        } catch (insertError) {
            console.error('Error al insertar el registro:', insertError);
            await connection.query('ROLLBACK');
            console.log('Transacción revertida debido a un error en la inserción');
            throw insertError; // Relanzar para que lo maneje el catch externo
        }
    } catch (error) {
        console.error('Error al procesar la solicitud:');
        console.error('- Mensaje:', error.message);
        console.error('- Stack:', error.stack);
        
        // Detalles adicionales para errores de base de datos
        if (error.code) console.error('- Código de error:', error.code);
        if (error.detail) console.error('- Detalles:', error.detail);
        if (error.hint) console.error('- Sugerencia:', error.hint);
        if (error.position) console.error('- Posición del error:', error.position);
        
        // Hacer rollback si hay una transacción activa
        if (connection) {
            try {
                await connection.query('ROLLBACK');
                console.log('Transacción revertida debido a un error');
            } catch (rollbackError) {
                console.error('Error al hacer rollback:', rollbackError);
            }
        }
        
        // Determinar el código de estado HTTP apropiado
        const statusCode = error.code === '23505' ? 409 : 500; // 409 para duplicados
        
        // Enviar respuesta de error
        res.status(statusCode).json({
            success: false,
            message: 'Error al procesar la solicitud',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor',
            ...(process.env.NODE_ENV === 'development' && { 
                details: error.detail,
                hint: error.hint,
                code: error.code
            })
        });
    } finally {
        // Liberar la conexión de vuelta al pool
        if (connection) {
            try {
                // Verificar si la conexión aún está activa antes de liberarla
                if (connection._connected || !connection._ending) {
                    await connection.release(true); // Forzar la liberación
                    console.log('Conexión liberada al pool');
                }
            } catch (releaseError) {
                console.error('Error al liberar la conexión:', releaseError);
            }
        }
    }
});

// Ruta para cargar la página de formación
app.get('/formacion', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'formacion.html'));
});

// Ruta para guardar un registro de formación
app.post('/api/formacion', express.json(), async (req, res) => {
    const formacion = req.body;
    let connection;
    
    // Validar que se haya proporcionado el ID del oficial
    if (!formacion.id_oficial) {
        return res.status(400).json({ 
            success: false, 
            message: 'El ID del oficial es requerido' 
        });
    }
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el oficial exista
        const [oficial] = await connection.query(
            'SELECT id FROM oficiales WHERE id = ?',
            [formacion.id_oficial]
        );
        
        if (oficial.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'El oficial especificado no existe' 
            });
        }
        
        // Insertar el registro de formación
        const [result] = await connection.query(
            'INSERT INTO formacion (id_oficial, curso, tipo_curso, institucion, fecha_curso, resultado) VALUES (?, ?, ?, ?, ?, ?)',
            [
                formacion.id_oficial,
                formacion.curso, 
                formacion.tipo_curso, 
                formacion.institucion, 
                formacion.fecha_curso, 
                formacion.resultado_curso
            ]
        );
        
        await connection.commit();
        res.status(201).json({ 
            success: true, 
            message: 'Registro de formación guardado exitosamente',
            id: result.insertId 
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error al guardar el registro de formación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al guardar el registro de formación',
            error: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para obtener todos los registros de formación
app.get('/api/formacion', async (req, res) => {
    const { id_oficial } = req.query;
    let query = 'SELECT f.*, o.nombre_completo AS nombre_oficial FROM formacion f ';
    query += 'LEFT JOIN oficiales o ON f.id_oficial = o.id ';
    
    const params = [];
    
    if (id_oficial) {
        query += 'WHERE f.id_oficial = ? ';
        params.push(id_oficial);
    }
    
    query += 'ORDER BY f.fecha_curso DESC';
    
    try {
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener los registros de formación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener los registros de formación',
            error: error.message 
        });
    }
});

// Ruta para obtener competencias básicas
app.get('/api/competencias', async (req, res) => {
    const { id_oficial } = req.query;
    let query = 'SELECT c.*, o.nombre_completo AS nombre_oficial FROM competencias_basicas c ';
    query += 'LEFT JOIN oficiales o ON c.id_oficial = o.id ';
    
    const params = [];
    
    if (id_oficial) {
        query += 'WHERE c.id_oficial = ? ';
        params.push(id_oficial);
    }
    
    query += 'ORDER BY c.fecha DESC';
    
    try {
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener las competencias básicas:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener las competencias básicas',
            error: error.message 
        });
    }
});

// Ruta para guardar una competencia básica
app.post('/api/competencias', upload.single('archivo_pdf'), async (req, res) => {
    const competencia = req.body;
    const archivo = req.file;
    let connection;
    
    // Validar que se haya proporcionado el ID del oficial
    if (!competencia.id_oficial) {
        return res.status(400).json({ 
            success: false, 
            message: 'El ID del oficial es requerido' 
        });
    }
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el oficial exista
        const [oficial] = await connection.query(
            'SELECT id FROM oficiales WHERE id = ?',
            [competencia.id_oficial]
        );
        
        if (oficial.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'El oficial especificado no existe' 
            });
        }
        
        // Guardar el archivo si se proporcionó
        let rutaArchivo = null;
        if (archivo) {
            rutaArchivo = `/uploads/${archivo.filename}`;
        }
        
        // Insertar la competencia en la base de datos
        const [result] = await connection.query(
            'INSERT INTO competencias_basicas (id_oficial, fecha, institucion, resultado, vigencia, enlace_constancia, ruta_archivo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                competencia.id_oficial,
                competencia.fecha_competencia,
                competencia.institucion_competencia,
                competencia.resultado_competencia,
                competencia.vigencia,
                competencia.enlace_constancia || null,
                rutaArchivo
            ]
        );
        
        await connection.commit();
        res.status(201).json({ 
            success: true, 
            message: 'Competencia básica guardada exitosamente',
            id: result.insertId 
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error al guardar la competencia básica:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al guardar la competencia básica',
            error: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para guardar una evaluación
app.post('/api/evaluaciones', express.json(), async (req, res) => {
    const evaluacion = req.body;
    
    // Validar datos de entrada
    if (!evaluacion.id_oficial || !evaluacion.tipo_evaluacion || !evaluacion.fecha_evaluacion || !evaluacion.evaluador) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan campos requeridos: id_oficial, tipo_evaluacion, fecha_evaluacion y evaluador son obligatorios' 
        });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Insertar la evaluación en la base de datos
        const [result] = await connection.execute(
            `INSERT INTO evaluaciones 
             (id_oficial, tipo_evaluacion, fecha_evaluacion, calificacion, evaluador, observaciones, usuario_registro)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                evaluacion.id_oficial,
                evaluacion.tipo_evaluacion,
                evaluacion.fecha_evaluacion, // Ya debe venir en formato YYYY-MM-DD
                evaluacion.calificacion || null,
                evaluacion.evaluador,
                evaluacion.observaciones || null,
                1 // usuario_registro temporal - en producción debería venir del usuario autenticado
            ]
        );
        
        await connection.commit();
        connection.release();
        
        res.status(201).json({
            success: true,
            message: 'Evaluación guardada correctamente',
            id: result.insertId
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        
        console.error('Error al guardar la evaluación:', error);
        res.status(500).json({
            success: false,
            message: 'Error al guardar la evaluación',
            error: error.message,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
    }
});

// Ruta para obtener las evaluaciones
app.get('/api/evaluaciones', async (req, res) => {
    let connection;
    try {
        console.log('Obteniendo conexión a la base de datos...');
        connection = await pool.getConnection();
        console.log('Conexión a la base de datos establecida');
        
        console.log('Ejecutando consulta de evaluaciones...');
        const [evaluaciones] = await connection.query(
            `SELECT e.*, o.nombre_completo as nombre_oficial,
                    'Sistema' as nombre_usuario
             FROM evaluaciones e
             JOIN oficiales o ON e.id_oficial = o.id
             ORDER BY e.fecha_evaluacion DESC, e.fecha_registro DESC`
        );
        
        console.log(`Se encontraron ${evaluaciones.length} evaluaciones`);
        
        // Formatear fechas para mostrarlas correctamente
        const evaluacionesFormateadas = evaluaciones.map(eval => ({
            ...eval,
            fecha_evaluacion: eval.fecha_evaluacion ? new Date(eval.fecha_evaluacion).toISOString().split('T')[0] : null,
            fecha_registro: eval.fecha_registro ? new Date(eval.fecha_registro).toISOString() : null
        }));
        
        // Liberar la conexión antes de enviar la respuesta
        if (connection) {
            await connection.release();
            console.log('Conexión liberada');
        }
        
        res.json({
            success: true,
            data: evaluacionesFormateadas
        });
        
    } catch (error) {
        console.error('Error al obtener las evaluaciones:');
        console.error('- Mensaje:', error.message);
        console.error('- Stack:', error.stack);
        
        if (error.code) console.error('- Código de error:', error.code);
        if (error.detail) console.error('- Detalles:', error.detail);
        if (error.hint) console.error('- Sugerencia:', error.hint);
        
        // Asegurarse de liberar la conexión en caso de error
        if (connection) {
            try {
                await connection.release(true); // Forzar la liberación
                console.log('Conexión liberada después del error');
            } catch (releaseError) {
                console.error('Error al liberar la conexión:', releaseError);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al obtener las evaluaciones',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor',
            ...(process.env.NODE_ENV === 'development' && { 
                details: error.detail,
                hint: error.hint,
                code: error.code,
                stack: error.stack
            })
        });
    }
});

// Ruta para actualizar el estado de un oficial
app.put('/api/oficiales/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { activo } = req.body;
    
    if (activo === undefined) {
        return res.status(400).json({ success: false, message: 'El campo activo es requerido' });
    }
    
    try {
        const [result] = await pool.query(
            'UPDATE oficiales SET activo = ? WHERE id = ?',
            [activo, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Oficial no encontrado' });
        }
        
        res.json({ success: true, message: 'Estado actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar el estado del oficial:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar el estado del oficial' });
    }
});

// Ruta para obtener estadísticas de oficiales (activos e inactivos)
app.get('/api/oficiales/estadisticas', async (req, res) => {
    console.log('Solicitud recibida en /api/oficiales/estadisticas');
    let connection;
    try {
        console.log('Obteniendo conexión a la base de datos...');
        connection = await pool.getConnection();
        console.log('Conexión a la base de datos establecida');
        
        // Contar oficiales activos
        console.log('Contando oficiales activos...');
        const [activos] = await connection.query(
            'SELECT COUNT(*) as count FROM oficiales WHERE activo = 1'
        );
        console.log('Oficiales activos:', activos[0].count);
        
        // Contar oficiales inactivos
        console.log('Contando oficiales inactivos...');
        const [inactivos] = await connection.query(
            'SELECT COUNT(*) as count FROM oficiales WHERE activo = 0 OR activo IS NULL'
        );
        console.log('Oficiales inactivos:', inactivos[0].count);
        
        const result = {
            activos: activos[0].count,
            inactivos: inactivos[0].count
        };
        
        console.log('Enviando respuesta:', result);
        res.json(result);
        
    } catch (error) {
        console.error('Error al obtener estadísticas de oficiales:');
        console.error('Mensaje de error:', error.message);
        console.error('Stack trace:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener estadísticas de oficiales',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (connection) {
            console.log('Liberando conexión a la base de datos...');
            await connection.release();
        }
    }
});

// Ruta para buscar oficiales
app.get('/api/oficiales/buscar', async (req, res) => {
    const { termino } = req.query;
    
    if (!termino) {
        return res.status(400).json({ 
            success: false, 
            message: 'Término de búsqueda requerido' 
        });
    }
    
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT id, nombre_completo, curp, cuip, cup, edad, sexo, 
                    estado_civil, area_adscripcion, grado, cargo_actual, 
                    fecha_ingreso, escolaridad, telefono_contacto, 
                    telefono_emergencia, funcion, pdf_nombre_archivo, activo
             FROM oficiales 
             WHERE (nombre_completo LIKE ? OR curp LIKE ? OR cuip LIKE ? OR cup LIKE ?)
             ORDER BY activo DESC, nombre_completo`,
            [`%${termino}%`, `%${termino}%`, `%${termino}%`, `%${termino}%`]
        );
        
        connection.release();
        
        // Mapear resultados para incluir la URL del archivo
        const resultados = rows.map(oficial => ({
            ...oficial,
            pdf_url: oficial.pdf_nombre_archivo ? `/uploads/${oficial.pdf_nombre_archivo}` : null
        }));
        
        res.json({ success: true, data: resultados });
    } catch (error) {
        console.error('Error al buscar oficiales:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al buscar oficiales',
            error: error.message 
        });
    }
});

// Ruta de prueba de conexión
app.get('/api/test', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT 1 as test');
        connection.release();
        res.json({ 
            success: true, 
            message: 'Conexión exitosa a la base de datos', 
            data: rows 
        });
    } catch (error) {
        console.error('Error en la conexión a la base de datos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al conectar con la base de datos', 
            error: error.message 
        });
    }
});

// Ruta para manejar todas las demás rutas y servir index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error al enviar index.html:', err);
            res.status(500).send('Error al cargar la aplicación');
        }
    });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('\n=== ERROR GLOBAL ===');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  // Si es un error de CORS, devolver un 403
  if (err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: 'Acceso no permitido desde este origen',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Para otros errores, devolver 500
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
    console.log('Orígenes permitidos:', allowedOrigins);
    console.log('Credenciales de acceso:');
    console.log('Usuario: admin');
    console.log('Contraseña: admin');
    console.log('\nRutas disponibles:');
    console.log(`- POST /api/oficiales - Guardar un nuevo oficial`);
    console.log(`- GET /api/oficiales/buscar?termino= - Buscar oficiales`);
    console.log(`- GET /api/test - Probar conexión con la base de datos`);
});

