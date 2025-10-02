<?php
header('Content-Type: application/json');

// Este endpoint se llama automáticamente mientras configuras la actividad.
// Recibe el 'body' con la configuración, pero por ahora solo necesitamos
// devolver una respuesta exitosa para que Journey Builder sepa que todo está bien.

http_response_code(200);
echo json_encode(['success' => true]);
?>
