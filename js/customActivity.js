'use strict';

// Postmonger connection setup
var connection = new Postmonger.Session();

// Global objects
var payload = {};
var deData = [];
var journeySchemaFields = [];

// Waits for the document to be ready, then calls onRender
$(window).ready(onRender);

// Subscribes to Journey Builder events
connection.on('initActivity', initialize);
connection.on('clickedNext', save);
connection.on('requestedSchema', handleSchema);

function onRender() {
    connection.trigger('ready');
    $('#plantillaSelect').on('change', function() {
        var selectedPlantillaName = $(this).val();
        updateUIForSelectedPlantilla(selectedPlantillaName);
    });
}

function initialize(data) {
    if (data) {
        payload = data;
    }
    connection.trigger('requestSchema');
}

function handleSchema(schemaData) {
    if (schemaData && schemaData.schema) {
        journeySchemaFields = [];
        schemaData.schema.forEach(function(field) {
            if (field.key && !field.key.startsWith('Event.APIEvent')) {
                journeySchemaFields.push({
                    name: field.name,
                    key: field.key
                });
            }
        });
    }
    fetchDataFromDE();
}

function fetchDataFromDE() {
    var dataUrl = "getData.php";
    $.ajax({
        url: dataUrl,
        method: 'GET',
        success: function(data) {
            deData = data;
            populateDropdown(deData);
            restoreUiState();
            $('#loader').addClass('hidden');
            $('#config-form').removeClass('hidden');
        },
        error: function(xhr, status, error) {
            console.error("Error fetching DE data:", status, xhr.responseText);
            $('#loader').html('<p class="text-danger">Error al cargar las plantillas. Verifique la consola.</p>');
        }
    });
}

function restoreUiState() {
    var inArguments = (payload['arguments'] && payload['arguments'].execute && payload['arguments'].execute.inArguments) ? payload['arguments'].execute.inArguments : [];
    var args = {};

    inArguments.forEach(arg => {
        for (let key in arg) {
            args[key] = arg[key];
        }
    });

    if (args.plantillaSeleccionada) {
        $('#plantillaSelect').val(args.plantillaSeleccionada);
        updateUIForSelectedPlantilla(args.plantillaSeleccionada);
        if (args.variablesConfiguradas) {
            try {
                var savedVars = JSON.parse(args.variablesConfiguradas);
                $('.variable-selector').each(function() {
                    var varId = $(this).attr('id');
                    if (savedVars[varId]) {
                        $(this).val(savedVars[varId]);
                    }
                });
            } catch (e) {
                console.error("Could not parse saved variables", e);
            }
        }
    }
}

function populateDropdown(data) {
    var $select = $('#plantillaSelect');
    $select.empty().append('<option value="">-- Seleccione una plantilla --</option>');
    data.forEach(function(row) {
        var plantillaName = row.keys.plantilla;
        if (plantillaName) {
            $select.append($('<option>', { value: plantillaName, text: plantillaName }));
        }
    });
}

function updateUIForSelectedPlantilla(plantillaName) {
    // ... (El resto de esta función no necesita cambios, está correcta)
    $('#variablesContainer, #mediaContainer .media-preview, #botDisplay').addClass('hidden');
    $('#variablesContainer').empty();
    
    if (!plantillaName) return;

    var selectedRow = deData.find(row => row.keys.plantilla === plantillaName);
    if (!selectedRow) return;

    var values = selectedRow.values;

    if (values.bot) {
        $('#botName').text(values.bot);
        $('#botDisplay').removeClass('hidden');
    }
    
    var numVariables = parseInt(values.variables, 10);
    if (!isNaN(numVariables) && numVariables > 0) {
        var $container = $('#variablesContainer');
        $container.append('<label class="form-label">Variables de la Plantilla</label>');
        for (let i = 1; i <= numVariables; i++) {
            var selectId = `variable_${i}`;
            var selectHtml = `
                <div class="mb-2">
                    <label for="${selectId}" class="form-label small">Variable ${i}</label>
                    <select class="form-select variable-selector" id="${selectId}">
                        <option value="">-- Seleccione un Campo del Journey --</option>
                    </select>
                </div>`;
            var $selectWrapper = $(selectHtml);
            var $select = $selectWrapper.find('.variable-selector');
            
            journeySchemaFields.forEach(function(field) {
                $select.append($('<option>', {
                    value: '{{' + field.key + '}}',
                    text: field.name
                }));
            });
            $container.append($selectWrapper);
        }
        $container.removeClass('hidden');
    }

    const isUrl = (str) => str && (str.startsWith('http') || str.startsWith('/'));
    $('#videoPreview, #imagenPreview, #documentoPreview').addClass('hidden');
    if (isUrl(values.video)) {
        $('#videoLink').attr('href', values.video);
        $('#videoPreview').removeClass('hidden');
    }
    if (isUrl(values.imagen)) {
        $('#imagenSrc').attr('src', values.imagen);
        $('#imagenPreview').removeClass('hidden');
    }
    if (isUrl(values.documento)) {
        $('#documentoLink').attr('href', values.documento);
        $('#documentoPreview').removeClass('hidden');
    }
}

function save() {
    var plantillaSeleccionada = $('#plantillaSelect').val();
    var variablesConfiguradas = {};
    
    $('.variable-selector').each(function() {
        var id = $(this).attr('id');
        var value = $(this).val();
        variablesConfiguradas[id] = value;
    });

    // Asegurarse de que la estructura del payload existe
    payload['arguments'] = payload['arguments'] || {};
    payload['arguments'].execute = payload['arguments'].execute || {};

    // Escribir los argumentos dinámicamente
    payload['arguments'].execute.inArguments = [
        { "contactKey": "{{Contact.Key}}" },
        { "plantillaSeleccionada": plantillaSeleccionada },
        { "variablesConfiguradas": JSON.stringify(variablesConfiguradas) }
    ];
    
    payload['metaData'] = payload['metaData'] || {};
    payload['metaData'].isConfigured = true;

    connection.trigger('updateActivity', payload);
}
