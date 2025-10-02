<?php
// Establece la cabecera para asegurar que la respuesta siempre sea de tipo JSON.
header('Content-Type: application/json');

// --- OBTENER CREDENCIALES ---
// Lee las variables de entorno configuradas en el servidor (Heroku Config Vars).
$sfmc_client_id = getenv('SFMC_CLIENT_ID');
$sfmc_client_secret = getenv('SFMC_CLIENT_SECRET');
$sfmc_subdomain = getenv('SFMC_SUBDOMAIN');
$de_external_key = getenv('DE_EXTERNAL_KEY');

/**
 * Obtiene un token de acceso de la API de SFMC.
 */
function getAccessToken($clientId, $clientSecret, $subdomain) {
    if (empty($clientId) || empty($clientSecret) || empty($subdomain)) {
        http_response_code(500);
        echo json_encode(['error' => 'Variables de entorno (SFMC_CLIENT_ID, SFMC_CLIENT_SECRET, SFMC_SUBDOMAIN) no están configuradas en el servidor.']);
        exit();
    }

    $auth_url = "https://{$subdomain}.auth.marketingcloudapis.com/v2/token";
    $payload = json_encode([
        'grant_type' => 'client_credentials',
        'client_id' => $clientId,
        'client_secret' => $clientSecret
    ]);

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

/**
 * Usa un token de acceso para obtener los datos de una Data Extension.
 */
function getDeData($accessToken, $subdomain, $deKey) {
    $de_url = "https://{$subdomain}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/{$deKey}/rowset";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $de_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken
    ]);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        http_response_code(500);
        echo json_encode(['error' => 'cURL Error al consultar la Data Extension: ' . $err]);
        exit();
    }
    
    return json_decode($response);
}

// --- LÓGICA PRINCIPAL DEL SCRIPT ---

$accessToken = getAccessToken($sfmc_client_id, $sfmc_client_secret, $sfmc_subdomain);
$data = getDeData($accessToken, $sfmc_subdomain, $de_external_key);

// --- CAMBIO IMPORTANTE AQUÍ ---
// Si la respuesta no es la esperada, en lugar de un mensaje genérico,
// ahora devolveremos la respuesta COMPLETA que nos dio Marketing Cloud.
if (!$data || !isset($data->items)) {
    http_response_code(500);
    
    // Convertimos la respuesta de SFMC (que contiene el error) en un string para poder verla.
    $fullErrorResponse = json_encode($data, JSON_PRETTY_PRINT); 
    
    echo json_encode([
        'error' => 'SFMC devolvió una respuesta inesperada al consultar la DE. Respuesta completa: ' . $fullErrorResponse
    ]);
    exit();
}

// Si todo fue exitoso, devolver el array de items.
echo json_encode($data->items);

?>
