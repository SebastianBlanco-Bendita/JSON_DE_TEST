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

/**
 * The client-side code that executes when the Custom Activity editor is rendered.
 */
function onRender() {
    connection.trigger('ready');
    fetchDataFromDE();

    $('#plantillaSelect').on('change', function() {
        var selectedPlantillaName = $(this).val();
        updateUIForSelectedPlantilla(selectedPlantillaName);
    });
}

/**
 * Fetches all rows from the "TEST" Data Extension via our backend endpoint.
 */
function fetchDataFromDE() {
    var dataUrl = "getData.php"; 

    $.ajax({
        url: dataUrl,
        method: 'GET',
        success: function(data) {
            deData = data;
            populateDropdown(deData);
            $('#loader').addClass('hidden');
            $('#config-form').removeClass('hidden');
        },
        error: function(xhr, status, error) {
            console.error("Error fetching DE data:", status, xhr.responseText);
            $('#loader').html('<p class="text-danger">Error al cargar las plantillas. Verifique la consola.</p>');
        }
    });
}

/**
 * Populates the dropdown with 'Plantilla' names.
 */
function populateDropdown(data) {
    var $select = $('#plantillaSelect');
    $select.empty().append('<option value="">-- Seleccione una plantilla --</option>');
    data.forEach(function(row) {
        var plantillaName = row.keys.plantilla;
        
        if (plantillaName) {
            $select.append($('<option>', {
                value: plantillaName,
                text: plantillaName
            }));
        }
    });
}

/**
 * Updates the UI based on the selected plantilla.
 */
function updateUIForSelectedPlantilla(plantillaName) {
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
            // *** MODIFICADO: Ahora solo creamos una lista desplegable por cada variable ***
            var selectId = `variable_${i}`;
            var selectHtml = `
                <div class="mb-2">
                    <label for="${selectId}" class="form-label small">Variable ${i}</label>
                    <select class="form-select variable-selector" id="${selectId}">
                        <option value="">-- Seleccione un Campo del Journey --</option>
                    </select>
                </div>`;
            var $selectWrapper = $(selectHtml);

            // Poblar el selector con los campos del esquema del Journey
            var $select = $selectWrapper.find('.variable-selector');
            journeySchemaFields.forEach(function(field) {
                $select.append($('<option>', {
                    value: '{{' + field.key + '}}', // Guardamos el valor con el formato de Journey Builder
                    text: field.name
                }));
            });

            $container.append($selectWrapper);
        }
        $container.removeClass('hidden');
    }

    if (values.video) {
        $('#videoLink').attr('href', values.video);
        $('#videoPreview').removeClass('hidden');
    }
    if (values.imagen) {
        $('#imagenSrc').attr('src', values.imagen);
        $('#imagenPreview').removeClass('hidden');
    }
    if (values.documento) {
        $('#documentoLink').attr('href', values.documento);
        $('#documentoPreview').removeClass('hidden');
    }
}


/**
 * Initializes the activity with previously saved data.
 */
function initialize(data) {
    if (data) {
        payload = data;
    }

    // *** CORRECCIÓN: 'data.schema' es un objeto, no un array. Extraemos el array de campos de su interior. ***
    if (data && data.schema && typeof data.schema === 'object') {
        // Usualmente, el array de campos es el primer (y único) valor dentro del objeto del esquema
        const fields = Object.values(data.schema)[0]; 
        if (Array.isArray(fields)) {
            fields.forEach(function(field) {
                if (!field.key.startsWith('Event.APIEvent')) {
                     journeySchemaFields.push({
                        name: field.name,
                        key: field.key
                    });
                }
            });
        }
    }

    var inArguments = payload['arguments'].execute.inArguments || [];
    var args = {};
    inArguments.forEach(arg => {
        for (let key in arg) {
            args[key] = arg[key];
        }
    });

    var checkDataLoaded = setInterval(function() {
        if (deData.length > 0) {
            clearInterval(checkDataLoaded);

            if (args.plantillaSeleccionada) {
                $('#plantillaSelect').val(args.plantillaSeleccionada).trigger('change');
                
                setTimeout(function() {
                    if (args.variablesConfiguradas) {
                        try {
                            var savedVars = JSON.parse(args.variablesConfiguradas);
                            // *** MODIFICADO: Ahora poblamos los <select> en lugar de los <input> ***
                            $('.variable-selector').each(function() {
                                var varName = $(this).attr('id');
                                if (savedVars[varName]) {
                                    $(this).val(savedVars[varName]);
                                }
                            });
                        } catch(e) { console.error("Could not parse saved variables", e); }
                    }
                }, 100);
            }
        }
    }, 100);
}

/**
 * Saves the current configuration of the activity.
 */
function save() {
    var plantillaSeleccionada = $('#plantillaSelect').val();
    var variablesConfiguradas = {};
    
    // *** MODIFICADO: Ahora leemos el valor de cada lista desplegable '.variable-selector' ***
    $('.variable-selector').each(function() {
        var id = $(this).attr('id');
        var value = $(this).val();
        variablesConfiguradas[id] = value;
    });

    payload['arguments'].execute.inArguments = [
        { "contactKey": "{{Contact.Key}}" },
        { "plantillaSeleccionada": plantillaSeleccionada },
        { "variablesConfiguradas": JSON.stringify(variablesConfiguradas) }
    ];
    
    payload['metaData'] = payload['metaData'] || {};
    payload['metaData'].isConfigured = true;

    connection.trigger('updateActivity', payload);
}
