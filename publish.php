<?php
header('Content-Type: application/json');
// Este endpoint se llama cuando se publica el Journey.
// También devolvemos una respuesta exitosa.
echo json_encode(['success' => true]);
?>
