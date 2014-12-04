/**
 * A HTML5 Validation replacement
 */
(function (document, window, $) {
    "use strict";

    var ERROR_CLASS_NAME = 'form-error', INPUT_ERROR_CLASS = 'invalid', LOADING_CLASS = 'loading';

    if (!window.FlexCss) {
        window.FlexCss = {};
    }

    var FlexCss = window.FlexCss;

    /**
     * Enhanced flexcss forms
     * @param {HTMLElement} formElement
     * @param {Object} options
     * @constructor
     */
    FlexCss.Form = function (formElement, options) {

        var self = this;

        self.tooltips = null;

        self.options = {
            createTooltips: true,
            appendError: false
        };

        self.options = $.extend(self.options, options);

        /**
         * A List of Validators
         * @type {Object}
         * @private
         */
        self._validators = [];

        /**
         * @param {HTMLElement} field
         * @param {ValidityState} validity
         * @returns {*}
         * @private
         */
        function _setupErrorMessages(field, validity) {
            return FlexCss.Form.globalErrorMessageHandler ?
                FlexCss.Form.globalErrorMessageHandler.apply(self, [field, validity]) : false;
        }

        /**
         *
         * @param {HTMLElement} thisParent
         * @private
         */
        function _removeElementErrors(thisParent) {
            var errors = thisParent.querySelectorAll('.' + ERROR_CLASS_NAME), inputsWithErrorClasses =
                thisParent.querySelectorAll('.' + INPUT_ERROR_CLASS);
            for (var elementErrorIndex = 0; elementErrorIndex < errors.length; elementErrorIndex++) {
                errors[elementErrorIndex].parentNode.removeChild(errors[elementErrorIndex]);
            }
            for (var inputErrorIndex = 0; inputErrorIndex < inputsWithErrorClasses.length; inputErrorIndex++) {
                inputsWithErrorClasses[inputErrorIndex].classList.remove(INPUT_ERROR_CLASS);
                if (self.tooltips) {
                    self.tooltips.removeTooltip(inputsWithErrorClasses[inputErrorIndex]);
                }
            }
        }

        /**
         * Registers a custom validator
         * @param {String} name
         * @param {Function} validator
         * @returns {window.FlexCss.Form}
         */
        self.registerValidator = function (name, validator) {
            self._validators[name] = validator;
            return self;
        };

        /**
         * Runs async validation
         * @param {String} validationRef
         * @param {HTMLElement} field
         * @param {HTMLElement} form
         * @returns {*}
         * @private
         */
        function _runValidation(validationRef, field, form) {
            if (!self._validators[validationRef]) {
                throw 'Could not found validator: ' + validationRef;
            }
            var cl = field.classList, future = self._validators[validationRef].apply(self, [field, form]);
            cl.add(LOADING_CLASS);
            future.done(function () {
                cl.remove(LOADING_CLASS);
            });
            return future;
        }

        /**
         * Run custom validations for elements, validations are done async do support XHR Requests or other stuff
         *
         * @param {HTMLElement} form
         * @param {Array|NodeList} fields
         * @returns {$.Deferred} contains either true if validations passed or false if something went wrong
         * @private
         */
        function _customValidationsForElements(form, fields) {
            var futures = [], fieldsLength = fields.length;
            for (var iVal = 0; iVal < fieldsLength; iVal++) {
                var field = fields[iVal], validationRef = field.getAttribute('data-validate'), validity = field.validity;
                if (self._validators[validationRef]) {
                    // use local validation first and then continue with custom validations
                    if (!validity.customError && !validity.valid) {
                        continue;
                    }
                    futures.push(_runValidation(validationRef, field, form));
                }
            }
            return $.when.apply(self, futures).then(function () {
                var allFutures = arguments, l = allFutures.length;
                var result = {
                    checkedFields: fields,
                    foundAnyError: false
                };

                for (var fI = 0; fI < l; fI++) {
                    if (!allFutures[fI]) {
                        result.foundAnyError = true;
                    }
                }
                return $.Deferred().resolve(result);
            });
        }

        /**
         * Will handle errors for given fields
         * @param {HTMLElement} form
         * @param {Array|NodeList} fields
         * @param {Boolean} removeAllErrors
         */
        function prepareErrors(form, fields, removeAllErrors) {
            if (removeAllErrors) {
                _removeElementErrors(form);
            }
            for (var i = 0; i < fields.length; i++) {
                var field = fields[i], parent = field.parentNode, validity = field.validity;
                if (validity && !validity.valid) {
                    if (!removeAllErrors) {
                        // Remove current errors:
                        _removeElementErrors(parent);
                    }
                    // setup custom error messages:
                    _setupErrorMessages(field, validity);
                    field.classList.add('invalid');
                    if (self.options.appendError) {
                        parent.insertAdjacentHTML("beforeend", '<div class="' + ERROR_CLASS_NAME + '">' +
                        field.validationMessage +
                        "</div>");
                    }
                } else {
                    field.classList.remove('invalid');
                    _removeElementErrors(parent);
                }
                // FIXME: Safari seems to have a bug here and will not reset customError so we reset:
                field.setCustomValidity('');
            }
        }

        function validateCustomFields(form) {
            return _customValidationsForElements(
                form, form.querySelectorAll("[data-validate]"));
        }

        /**
         * Creates an array from a node list with invalid items
         * On Firefox also Fieldset's seems to be invalid, remove them
         * @param list
         * @returns {Array}
         * @private
         */
        function _createArrayFromInvalidFieldList(list) {
            var arr = [];
            for (var i = 0; i < list.length; ++i) {
                var n = list[i];
                if (!(n instanceof HTMLFieldSetElement)) {
                    arr.push(n);
                }
            }
            return arr;
        }

        /**
         * Creates a tooltip at given element, will create a new instance if not created
         * @param {HTMLElement} target
         * @param {HTMLElement} form
         * @private
         */
        function _showAndOrCreateTooltip(target, form, remove) {

            if (!self.tooltips && self.options.createTooltips) {
                self.tooltips = new FlexCss.Tooltip(form);
            }

            setTimeout(function () {
                if (!target.validity.valid && target.classList.contains(INPUT_ERROR_CLASS)) {
                    self.tooltips.createTooltip(target, target.validationMessage, false);
                } else {
                    if(remove) {
                        self.tooltips.removeTooltip(target);
                    }
                }
            }, 0);

        }

        /**
         * Initializes validation for a given form, registers event handlers
         * @param {HTMLElement} form
         */
        function initFormValidation(form) {
            // Suppress the default bubbles
            var invalidFormFired = false, currentValidationFuture;
            form.addEventListener("invalid", function (e) {
                e.preventDefault();
                var invalidFields = form.querySelectorAll(":invalid");
                var arr = _createArrayFromInvalidFieldList(invalidFields);
                // Prevent fire this N times:
                if (arr.indexOf(e.target) > 0) {
                    return;
                }
                // focus the first field:
                if (arr.length > 0) {
                    setTimeout(function () {
                        arr[0].focus();
                        _showAndOrCreateTooltip(arr[0], form);
                    }, 0);
                }
                currentValidationFuture = $.Deferred();

                var validation = validateCustomFields(form);
                prepareErrors(form, arr, true);
                validation.done(function (r) {
                    prepareErrors(form, r.checkedFields, false);
                    currentValidationFuture.resolve(r);
                    invalidFormFired = false;
                });

            }, true);

            // handle focus out for text elements
            form.addEventListener("blur", function (e) {
                if (self.tooltips) {
                    self.tooltips.removeTooltip(e.target);
                }
                var target = e.target, hasError = false;
                if (target instanceof HTMLSelectElement) {
                    return;
                }
                if (target.classList.contains(INPUT_ERROR_CLASS)) {
                    hasError = true;
                }
                _customValidationsForElements(form, [e.target]).done(function () {
                    prepareErrors(form, [e.target], false);
                });
                if (!hasError) {
                    _showAndOrCreateTooltip(e.target, form);
                }

            }, true);

            form.addEventListener("focus", function (e) {
                // do not track errors for checkbox and radios on focus:
                var attr = e.target.getAttribute('type');
                if (attr === 'checkbox' || attr === 'option' ||
                    e.target instanceof HTMLSelectElement) {
                    return;
                }
                _showAndOrCreateTooltip(e.target, form);
            }, true);

            // Handle change for checkbox, radios and selects
            form.addEventListener("change", function (e) {
                var name = e.target.getAttribute('name');
                if (name) {
                    var inputs = form.querySelectorAll('[name="' + name + '"]');
                    _customValidationsForElements(form, inputs).done(function () {
                        prepareErrors(form, inputs, false);
                        _showAndOrCreateTooltip(e.target, form, true);
                    });
                }
            });

            // prevent default if form is invalid
            var submitListener = function (e) {
                e.preventDefault();
                if (form.classList.contains(LOADING_CLASS)) {
                    return false;
                }
                form.classList.add(LOADING_CLASS);
                form.removeEventListener("submit", submitListener);
                _removeElementErrors(form);
                // reset:
                if (form.checkValidity()) {
                    form.addEventListener("submit", submitListener);
                    console.log("check");
                    // Custom validations did never pass
                    currentValidationFuture = $.Deferred();
                    var validation = validateCustomFields(form);
                    validation.done(function (r) {
                        prepareErrors(form, r.checkedFields, false);
                        currentValidationFuture.resolve(r);
                    });
                    currentValidationFuture.done(function (r) {
                        form.removeEventListener("submit", submitListener);
                        form.classList.remove(LOADING_CLASS);
                        if (r.foundAnyError) {
                            form.addEventListener("submit", submitListener);
                        } else {
                            form.submit();
                        }
                    });
                } else {
                    form.classList.remove(LOADING_CLASS);
                    form.addEventListener("submit", submitListener);
                }
            };
            form.addEventListener("submit", submitListener);
        }

        initFormValidation(formElement);
    };

    FlexCss.Form.globalErrorMessageHandler = function () {
    };


    /**
     * Registers a global event Handler
     * @param errorFunc
     */
    FlexCss.Form.registerErrorMessageHandler = function (errorFunc) {
        FlexCss.Form.globalErrorMessageHandler = errorFunc;
    };

    /**
     * Initilizes forms for a specific selector
     * @param selector
     */
    FlexCss.Form.init = function (selector) {
        var forms = document.querySelectorAll(selector);
        for (var i = 0; i < forms.length; i++) {
            new FlexCss.Form(forms[i]);
        }
    };

    FlexCss.Form.init("form");

})(document, window, jQuery);