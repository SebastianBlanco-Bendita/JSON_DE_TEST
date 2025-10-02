<?php
header('Content-Type: application/json');
// Journey Builder envía la configuración de la actividad a este endpoint para validarla.
// Por ahora, simplemente devolvemos una respuesta exitosa para pasar la validación.
echo json_encode(['success' => true]);
?>
