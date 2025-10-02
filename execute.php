<?php
header('Content-Type: application/json');
// Este es el endpoint más importante. Se llama por cada contacto que pasa por la actividad.
// Aquí iría la lógica principal (ej. enviar un SMS, llamar a otra API, etc.).
// Por ahora, lo dejamos devolviendo una respuesta exitosa.

// Opcional: Puedes guardar los datos que llegan del Journey en los logs de Heroku para verlos.
// $json = file_get_contents('php://input');
// error_log($json);

http_response_code(200);
echo json_encode(['success' => true]);
?>
