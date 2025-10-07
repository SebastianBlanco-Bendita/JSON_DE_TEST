<?php
// Establece la cabecera para asegurar que la respuesta siempre sea de tipo JSON.
header('Content-Type: application/json');

// --- OBTENER CREDENCIALES ---
$sfmc_client_id = getenv('SFMC_CLIENT_ID');
$sfmc_client_secret = getenv('SFMC_CLIENT_SECRET');
$sfmc_subdomain = getenv('SFMC_SUBDOMAIN');
$de_external_key = getenv('DE_EXTERNAL_KEY');

function getAccessToken($clientId, $clientSecret, $subdomain) {
    if (empty($clientId) || empty($clientSecret) || empty($subdomain)) {
        http_response_code(500);
        echo json_encode(['error' => 'Variables de entorno (SFMC_CLIENT_ID, SFMC_CLIENT_SECRET, SFMC_SUBDOMAIN) no están configuradas.']);
        exit();
    }
    $auth_url = "https://{$subdomain}.auth.marketingcloudapis.com/v2/token";
    $payload = json_encode(['grant_type' => 'client_credentials', 'client_id' => $clientId, 'client_secret' => $clientSecret]);
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $auth_url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) {
        http_response_code(500);
        echo json_encode(['error' => 'cURL Error al contactar SFMC: ' . $err]);
        exit();
    }
    $decoded_response = json_decode($response);
    if (isset($decoded_response->error)) {
        http_response_code(401);
        $errorMessage = isset($decoded_response->error_description) ? $decoded_response->error_description : 'Error desconocido de SFMC.';
        echo json_encode(['error' => 'SFMC Auth Error: ' . $decoded_response->error . ' - ' . $errorMessage]);
        exit();
    }
    return $decoded_response->access_token ?? null;
}

function getDeData($accessToken, $subdomain, $deKey) {
    $de_url = "https://{$subdomain}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/{$deKey}/rowset";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $de_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
    curl_setopt($ch, CURLOPT_SSLVERSION, 6);
    $response = curl_exec($ch);
    $err = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($response === false) {
        http_response_code(500);
        echo json_encode(['error' => 'La llamada cURL a la DE falló.', 'curl_error_message' => $err, 'http_status_code' => $http_code]);
        exit();
    }
    if ($http_code >= 400) {
        http_response_code($http_code);
        echo json_encode(['error' => 'SFMC devolvió un error al consultar la DE.', 'http_status_code' => $http_code, 'sfmc_response_body' => json_decode($response)]);
        exit();
    }
    return json_decode($response);
}

// --- LÓGICA PRINCIPAL DEL SCRIPT ---
$accessToken = getAccessToken($sfmc_client_id, $sfmc_client_secret, $sfmc_subdomain);
$data = getDeData($accessToken, $sfmc_subdomain, $de_external_key);

if (!$data || !isset($data->items)) {
    http_response_code(500);
    $fullErrorResponse = json_encode($data, JSON_PRETTY_PRINT); 
    echo json_encode(['error' => 'La respuesta de SFMC no contenía la propiedad "items". Respuesta completa: ' . $fullErrorResponse]);
    exit();
}

// --- LÍNEA DE DEBUG AÑADIDA ---
// Convertimos el objeto de datos a un string JSON formateado para poder verlo bien en los logs de Heroku.
$debugData = json_encode($data, JSON_PRETTY_PRINT);
error_log("--- DATA RECEIVED FROM SFMC API --- \n" . $debugData . "\n----------------------------------\n");
// -----------------------------

// Si todo fue exitoso, devolver el array de items.
echo json_encode($data->items);

?>
