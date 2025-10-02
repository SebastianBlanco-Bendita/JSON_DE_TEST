'use strict';

// Postmonger connection setup
var connection = new Postmonger.Session();

// Global objects
var payload = {};
var deData = []; // To store all data from the DE

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
    // CAMBIO IMPORTANTE: Apuntamos al script PHP en lugar de una ruta de Node.js
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
            console.error("Error fetching DE data:", error, xhr.responseText);
            $('#loader').html('<p class="text-danger">Error al cargar las plantillas. Verifique la consola.</p>');
        }
    });
}

/**
 * Populates the dropdown with 'Plantilla' names.
 * @param {Array} data - Array of objects from the DE.
 */
function populateDropdown(data) {
    var $select = $('#plantillaSelect');
    $select.empty().append('<option value="">-- Seleccione una plantilla --</option>');
    data.forEach(function(row) {
        var plantillaName = row.values.plantilla;
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
 * @param {string} plantillaName - The name of the selected plantilla.
 */
function updateUIForSelectedPlantilla(plantillaName) {
    $('#variablesContainer, #mediaContainer .media-preview, #botDisplay').addClass('hidden');
    $('#variablesContainer').empty();
    
    if (!plantillaName) return;

    var selectedRow = deData.find(row => row.values.plantilla === plantillaName);
    if (!selectedRow) return;

    var values = selectedRow.values;

    // Display Bot name
    if (values.bot) {
        $('#botName').text(values.bot);
        $('#botDisplay').removeClass('hidden');
    }
    
    // Generate variable input fields
    var numVariables = parseInt(values.variables, 10);
    if (!isNaN(numVariables) && numVariables > 0) {
        var $container = $('#variablesContainer');
        $container.append('<label class="form-label">Variables de la Plantilla</label>');
        for (let i = 1; i <= numVariables; i++) {
            var inputHtml = `
                <div class="mb-2">
                    <input type="text" class="form-control variable-input" id="variable_${i}" 
                           placeholder="Variable ${i}. Ej: {{Contact.Attribute...}}" 
                           data-variable-name="Variable ${i}">
                </div>`;
            $container.append(inputHtml);
        }
        $container.removeClass('hidden');
    }

    // Show media if available
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
 * @param {object} data - The activity's saved configuration.
 */
function initialize(data) {
    if (data) {
        payload = data;
    }

    var inArguments = payload['arguments'].execute.inArguments || [];
    var args = {};
    inArguments.forEach(arg => {
        for (let key in arg) {
            args[key] = arg[key];
        }
    });

    // Wait until DE data is loaded before setting values
    var checkDataLoaded = setInterval(function() {
        if (deData.length > 0) {
            clearInterval(checkDataLoaded);

            if (args.plantillaSeleccionada) {
                $('#plantillaSelect').val(args.plantillaSeleccionada).trigger('change');
                
                setTimeout(function() {
                    if (args.variablesConfiguradas) {
                        try {
                            var savedVars = JSON.parse(args.variablesConfiguradas);
                            $('.variable-input').each(function() {
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
    
    $('.variable-input').each(function() {
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
