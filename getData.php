<?php
// Establece la cabecera para devolver una respuesta JSON
header('Content-Type: application/json');

// --- CONFIGURACIÓN ---
// Es MUY RECOMENDABLE usar variables de entorno en tu servidor (ej. Heroku Config Vars)
$sfmc_client_id = getenv('SFMC_CLIENT_ID');
$sfmc_client_secret = getenv('SFMC_CLIENT_SECRET');
$sfmc_subdomain = getenv('SFMC_SUBDOMAIN');
$de_external_key = getenv('DE_EXTERNAL_KEY'); // B690CB97-D7C2-46AB-A53B-B74A1DAAE1C0

// Función para obtener el token de acceso de SFMC
function getAccessToken($clientId, $clientSecret, $subdomain) {
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
        return null;
    }

    $decoded_response = json_decode($response);
    return isset($decoded_response->access_token) ? $decoded_response->access_token : null;
}

// Función para obtener los datos de la Data Extension
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
        return null;
    }
    
    return json_decode($response);
}

// Lógica principal del script
$accessToken = getAccessToken($sfmc_client_id, $sfmc_client_secret, $sfmc_subdomain);

if (!$accessToken) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo obtener el token de acceso de SFMC.']);
    exit();
}

$data = getDeData($accessToken, $sfmc_subdomain, $de_external_key);

if (!$data || !isset($data->items)) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudieron obtener los datos de la Data Extension.']);
    exit();
}

// Devolver los datos en formato JSON
echo json_encode($data->items);

?>
