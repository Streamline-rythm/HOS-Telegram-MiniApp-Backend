import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

//--------------- local situation -------------------
// const CLIENT_CERT = "-----BEGIN CERTIFICATE-----\nMIIDbjCCAlagAwIBAgIEQBU7fzANBgkqhkiG9w0BAQsFADCBhTEtMCsGA1UELhMk\nMzM5YzkxM2ItMjhiNC00ODQ3LWE2MjEtMmZhNTJmNTUxZmYzMTEwLwYDVQQDEyhH\nb29nbGUgQ2xvdWQgU1FMIENsaWVudCBDQSBzeWFmaXEtY2xpZW50MRQwEgYDVQQK\nEwtHb29nbGUsIEluYzELMAkGA1UEBhMCVVMwHhcNMjUwNzE2MjM0NjUyWhcNMzUw\nNzE0MjM0NzUyWjA7MRYwFAYDVQQDEw1zeWFmaXEtY2xpZW50MRQwEgYDVQQKEwtH\nb29nbGUsIEluYzELMAkGA1UEBhMCVVMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw\nggEKAoIBAQCqvMHJF5ZQcIEmheOK0qJZVuh9vLdq5GTn5eZ8789Y9a1FpiMkPunU\nrQ2zbUY8/qCJfz05Z5tCbLJp9Ckz3733Bv48Wwsb7osGwyHMfAmPyMD+Luf34IqD\nTPmqEe/0+DY8BMgbhbr6MFC3kOxZpLYKHSHcMrubzTmGrmrBOyFGudRqGGqeFpwD\n6VBBDagM3mXQFts4URcebjMIdsSvY+zZ4jrHZ+/dXKYWK+HV8axS5Rybleqol7nX\nHgMHKGsLGTJuhmdk31VieLhnIVWj/tyi0uuCUwxmu58FD4mzIqwvArHvOlPAJT2c\n+zGIJWiWgNgsmZncMxfflPAANDbIFIo5AgMBAAGjLzAtMAkGA1UdEwQCMAAwIAYD\nVR0RBBkwF4EVcnl0aG1zbW9vdGhAZ21haWwuY29tMA0GCSqGSIb3DQEBCwUAA4IB\nAQB8E/QL88/uR3v0VDlZCsSYhAtAKU3Urhgc/BcQOQ8JYCNB6q1nYwyWFM92iO/x\nRE+O19Oo+AUnSCZ2A+Qrc3J+4W/H5IAI5TUGAEs+8e+KtPIyK0PPJHDqrromKkFT\n4DoSDrAOrwJHolpFeiN+zf6RcyPVY6WNUTTfvbvdON2KQbf1IK6iIXlTll0VxUR8\nWjbcBgd5y7X/PcncMtJT4N0YWZ879fmZzA+Oi/pEKGBNAJO7RsWsznvb+EGT8nVj\ng1syG80JMh+6X/P/uTrP/hZ0KpAPjJ+M7oXBHSNVX++LTEC/mMuGpTzbWBaVmIhL\nYNWYs+qHzPV5BSxS6UgvQcuN\n-----END CERTIFICATE-----";
// const SERVER_CA = "-----BEGIN CERTIFICATE-----\nMIIDfzCCAmegAwIBAgIBADANBgkqhkiG9w0BAQsFADB3MS0wKwYDVQQuEyQ5NjQ3\nZGNkMy02MGI0LTQyMDItYmE2MC0xNmY0ZDFlNjZlODMxIzAhBgNVBAMTGkdvb2ds\nZSBDbG91ZCBTUUwgU2VydmVyIENBMRQwEgYDVQQKEwtHb29nbGUsIEluYzELMAkG\nA1UEBhMCVVMwHhcNMjUwNjI2MTMxODM2WhcNMzUwNjI0MTMxOTM2WjB3MS0wKwYD\nVQQuEyQ5NjQ3ZGNkMy02MGI0LTQyMDItYmE2MC0xNmY0ZDFlNjZlODMxIzAhBgNV\nBAMTGkdvb2dsZSBDbG91ZCBTUUwgU2VydmVyIENBMRQwEgYDVQQKEwtHb29nbGUs\nIEluYzELMAkGA1UEBhMCVVMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIB\nAQDNuhIE1tuUc0DP1nl6ArszRFBFXPVcMV1BqC13pXzbRVBHD06EcHG0sA+4FOn2\nRk467blx4cwThlMYIlrDOBXA1vxHLUz4KN9UkSFHF+y+T7N/Mf53PvFUtx2liTSn\nPf+TXNtXg8Uh29dqkME0Gv1T4Uf8ku9gI9A3DKyxPU8exQoSq4AMr/RibGHDi9XI\nLfefY2e/u8HEQZcScyDf9wx8EiQTOVkO8QST0EfDLLpcC1/R2vIsl5GyJRKALQ0r\n+ZpP0xHHbcSHuMxaS/CM+zEcaoe7lV76cGjFWN9RE3mfEQGJWuMcXIxkQPRfNj1Z\nNdLhakteXLUKdgWjvIUire+FAgMBAAGjFjAUMBIGA1UdEwEB/wQIMAYBAf8CAQAw\nDQYJKoZIhvcNAQELBQADggEBAEZowmSy+bwmMj5vDBtPOwGHvm5VTUfgF7s7jGpR\nuoPo61S1kRsCLZUry3u7aie3dGhT1+FcK7bCl6Q/iqasXXEgUrZXhPXJfhoe7hCk\nWa2ZVz/1jUnR3DMfWywqESgEAbAxLTQY031D+Q+fGXf6niMBdosHJIYwsnp4rLDj\nUze3ITCS9RdPVw+HX/LFaYbAmAZrr9rhWDhxpVavSsRmy+dhLMfZSCUpPWwXa70y\nK5UlxA09VRN6o98F/QmLpVErXNFBNVa6tkboWgVBFsfPkzXF0FmY+czYefDA4Mxo\n+IH4OCbpuMNl5vIQAINvck3awpyGrUa4W0DnDiZlG1I9fS4=\n-----END CERTIFICATE-----";
// const CLIENT_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAqrzByReWUHCBJoXjitKiWVbofby3auRk5+XmfO/PWPWtRaYj\nJD7p1K0Ns21GPP6giX89OWebQmyyafQpM9+99wb+PFsLG+6LBsMhzHwJj8jA/i7n\n9+CKg0z5qhHv9Pg2PATIG4W6+jBQt5DsWaS2Ch0h3DK7m805hq5qwTshRrnUahhq\nnhacA+lQQQ2oDN5l0BbbOFEXHm4zCHbEr2Ps2eI6x2fv3VymFivh1fGsUuUcm5Xq\nqJe51x4DByhrCxkyboZnZN9VYni4ZyFVo/7cotLrglMMZrufBQ+JsyKsLwKx7zpT\nwCU9nPsxiCVoloDYLJmZ3DMX35TwADQ2yBSKOQIDAQABAoIBAAFXfKcS7s3Yxn3a\nCNup5yTDcOejdIylrEo7JXYUCeAU3sZyRVD6R0rlZcF9vjlJ1hMVvoWaSnWjP+P8\nhNh5I+4CXm9BvWfidn7IYlZJrFpDVv3tLZcMqw+YJFc8oky9glEALh5/2dEJxGnS\nFoNnu5aY6KlWKW245Ab3WhQrUQO0SQFnRNyCCCgV44n3bVmCoBqXekGskajts7bS\n9sdv3TQoy+CKlhD3PILGlnNFUnJMXYkIh6nlXNNsfo64TxXb54pmHd1/X1uHlNQ1\nXdwfzE0G5PC/z6NQlw7woTssWTi8DV2jmGf9DM4+bHbX4vXPfgmMmSgJqKbcQmni\neDUYWsECgYEA4bWWVnjF65lLBTWjQej2dpiAU7pKUE0QWJW3L2mXBqnLDbO948Ca\n/SSehcAVQmSeq1faMSi/PU5+M8TdQUPyVIEdaJAlPM4Jmz4KTB5vUwQJgOfihAfG\ntGxwxFQXHr0hgsSZNwSizwVAISrevdCZyMcLoEEx4nyY9lX0//kefEECgYEAwaaQ\n1YopB1geEEOjTgBtlnU+2SJUmY+8Zfxb2IZcIe+Fniov4Le9T1EpvDzxpGmdkseb\n6f/5uqkyWmeaOxqmrKqwLigguYDErdkm6MURqy85LCaGD9hWil/pQgIkRYQJEsne\n1mGWcRTAnVXhv8NUOo70Z5AWLWlkDGHlMywt7/kCgYBWgaBTGArTV3dXUc12j3EW\n1zAn5vhgeojPSuJgu5l0plL6t28KAWHlr8lJ/eqn/aSKiytHOBTDzHe2I7ehMgeI\nt8urrcN34IfyBf8wWWHVcXCrBTTd4ZUYxY8a0BfkYhyb3/nRCmfT7HE9xQ6FtZOb\nTh54l0QlSBfgIeW6zaIPgQKBgEEBmT0V1BATFISBMCDPI/qOATsCu0ORbL0PqgVV\nlTgPH9uobcoR5ArsRAZcrwFyMuNC/qPeugZfJfgTL0MH/0uXQO09qz6aa2uwqc8Z\n2ISOpbKcfAR1qxdoevUdou9zE1irS5LLz6TGQqKOYentuCiwNHtPcyJrbpp5gmdb\nPVCBAoGBAIs1IEPxC6JVk0VWqykFJX59nKp32OY9MQGjoMPnnXOiQHzf9P4qyalS\nd23ZcWHOJrgiTTcFjAM+8kefsq4B9dSkceT99HvZwguPZsX5V9L2gKkrH/ltHCJBK6lkyp7rR59rcfaNCBmyN5+g+9hBXsMPdoC05zF/55w7Gx4Eg5ka\n-----END RSA PRIVATE KEY-----";

// const client_cert = CLIENT_CERT?.replace(/\\n/g, '\n');
// const server_ca = SERVER_CA?.replace(/\\n/g, '\n');
// const client_key = CLIENT_KEY?.replace(/\\n/g, '\n');

// const pool = mysql.createPool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     ssl: {
//         ca: server_ca,
//         cert: client_cert,
//         key: client_key,
//     },
// });

//--------------- Cloud run situation -------------------
const pool = mysql.createPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  socketPath: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to the database');
        connection.release();
    } catch (error) {
        console.error('❌ Failed to connect to the database:', error.message);
    }
})();

export default pool;
