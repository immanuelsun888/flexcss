/*global Form, HTMLFormElement, fetch, FormData*/

import Tooltip from 'Tooltip';
export * from 'isomorphic-fetch';
import Event from 'util/Event';
import Util from 'util/Util';

const ERROR_CLASS_NAME = 'form-error';
const INPUT_ERROR_CLASS = 'invalid';
const LOADING_CLASS = 'loading';
const ARIA_INVALID = 'aria-invalid';
const REMOTE = 'data-remote';
const REMOTE_ACTION = 'data-remote-action';
const ATTR_DISABLE_INLINE = 'data-disable-inline-validation';
const ATTR_VALIDATOR = 'data-validate';
const ATTR_DATA_CUSTOM_MESSAGE = 'data-validation-message';

/**
 * Triggered when form is fully initialized and handlers are binded
 * @type {string}
 */
export const EVENT_FORM_READY = 'flexcss.form.ready';
/**
 * Fires when a form is submitted, cancelable
 * @type {string}
 */
export const EVENT_FORM_SUBMIT = 'flexcss.form.submit';
/**
 * Fired directly after the form has been submitted via ajax
 * @type {string}
 */
export const EVENT_FORM_AFTER_AJAX_SUBMIT = 'flexcss.form.afterAjaxSubmit';
/**
 * Fired when ajax events did complete
 * @type {string}
 */
export const EVENT_FORM_AJAX_COMPLETED = 'flexcss.form.ajaxCompleted';

/**
 * A HTML5 Form Validation replacement
 */

export default
class Form {
    /**
     * @param {HTMLElement} form
     * @param [options] optional options
     */
    constructor(form, options) {

        if (!(form instanceof HTMLFormElement)) {
            throw 'argument {0} form needs to be an form element';
        }

        /**
         * The Form
         * @type {HTMLElement}
         */
        this.form = form;

        /**
         * @type {Tooltip}
         */
        this.tooltips = null;

        /**
         * @type {Promise}
         */
        this.currentValidationFuture = new Promise(() => {
        });

        /**
         * Default options
         * @type {Object}
         */
        this.options = {
            // if true creates tooltips above element, uses FlexCss Tooltips
            createTooltips: true,
            // if true appends error message after input element
            appendError: false,
            // type of ajax submit
            ajaxSubmitType: 'POST',
            // json content type if ajax method is set to json
            ajaxJsonContentType: 'application/json; charset=utf-8',
            // allow inline validation
            inlineValidation: true
        };

        // overwrite default options
        Object.assign(this.options, options);

        // apply settings from attributes
        Util.applyOptionsFromElement(form, this.options);

        // set form class as widget
        // Forms are very different to classical widgets,
        // we will not use our base widget class for this but just self
        form.hfWidgetInstance = this;

        /**
         * A List of Validators
         * @type {Object}
         * @private
         */
        this._validators = Form.globalValidators;

        /**
         * @type {Function}
         * @private
         */
        this._remoteValidationFunction = null;

        this.initFormValidation();
    }

    /**
     * Submits this form, either via ajax or just classical (default)
     * @param {HTMLFormElement} thisForm
     * @param {Event} e
     * @private
     * @returns {Promise|boolean} returns false if submit is cancled
     */
    _submitFunction(thisForm, e) {
        var shouldUseAjax = thisForm.getAttribute(REMOTE), ajaxPostUrl =
                thisForm.getAttribute(REMOTE_ACTION) ||
                thisForm.getAttribute('action') || window.location.href,
            useJson = 'json' === shouldUseAjax, self = this;

        var ev = Event.dispatch(thisForm, EVENT_FORM_SUBMIT).withOriginal(e).fire();

        // abort execution is event was prevented
        if (ev.defaultPrevented) {
            thisForm.classList.remove(LOADING_CLASS);
            return false;
        }

        if (null === shouldUseAjax) {
            // submit
            return thisForm.submit();
        }

        thisForm.classList.add(LOADING_CLASS);

        // prevent form from submit normally
        e.preventDefault();
        // support either JSON request payload or normal payload submission
        var serverCall = useJson ? fetch(ajaxPostUrl, {
            headers: {
                'Content-Type': this.options.ajaxJsonContentType
            },
            method: this.options.ajaxSubmitType,
            body: JSON.stringify(this.serialize())
        }) : fetch(ajaxPostUrl, {
            method: this.options.ajaxSubmitType,
            body: new FormData(thisForm)
        });


        Event.dispatch(thisForm, EVENT_FORM_AFTER_AJAX_SUBMIT).withOriginal(e).fire();

        return serverCall.then((r) => {
            (self._remoteValidationFunction || Form.globalRemoteValidationFunction).apply(self, [r]);

            Event.dispatch(thisForm, EVENT_FORM_AJAX_COMPLETED).withOriginal(e).withDetail(r).fire();
            // always remove error class
            thisForm.classList.remove(LOADING_CLASS);
        });
    }

    /**
     * Serializes a form to a json object
     * @returns {Object}
     */
    serialize() {
        var selectors = [
            'input[name]:not([type="radio"]):enabled',
            'input[type="radio"][name]:checked',
            'select[name]:enabled',
            'textarea[name]:enabled'
        ], inputs = this.form.querySelectorAll(selectors.join(',')), result = {};

        Array.prototype.forEach.call(inputs, function (input) {
            var exists = result[input.name], value = input.value;
            if (exists instanceof Array) {
                exists.push(value);
            } else if (exists) {
                result[input.name] = [result[input.name], value];
            } else {
                result[input.name] = value;
            }
        });

        return result;
    }

    /**
     * @param {HTMLElement} field
     * @param {ValidityState} validity
     * @returns {*}
     * @private
     */

    _setupErrorMessages(field, validity) {
        return Form.globalErrorMessageHandler ?
            Form.globalErrorMessageHandler.apply(this, [field, validity]) : false;
    }

    /**
     * @param {HTMLElement} thisParent
     * @private
     */
    _removeElementErrors(thisParent) {
        var errors = thisParent.querySelectorAll('.' + ERROR_CLASS_NAME), inputsWithErrorClasses =
            thisParent.querySelectorAll('.' + INPUT_ERROR_CLASS);
        for (var elementErrorIndex = 0; elementErrorIndex < errors.length; elementErrorIndex++) {
            errors[elementErrorIndex].parentNode.removeChild(errors[elementErrorIndex]);
        }
        for (var inputErrorIndex = 0; inputErrorIndex < inputsWithErrorClasses.length; inputErrorIndex++) {
            inputsWithErrorClasses[inputErrorIndex].classList.remove(INPUT_ERROR_CLASS);
            if (this.tooltips) {
                this.tooltips.removeTooltip(inputsWithErrorClasses[inputErrorIndex]);
            }
        }
    }


    /**
     * Registers a custom validator
     * @param {String} name
     * @param {Function} validator a validation function should always return either a Future(true) or Future(false)
     * even when the field has been invalidated with `setCustomValidity`, because of different browser `bugs`
     * we can't rely on that
     * @returns {Form}
     */
    registerValidator(name, validator) {
        this._validators[name] = validator;
        return this;
    }

    /**
     * Runs async validation
     * @param {String} validationRef
     * @param {HTMLElement} field
     * @returns {Promise}
     * @private
     */
    _runValidation(validationRef, field) {
        if (!this._validators[validationRef]) {
            throw 'Could not found validator: ' + validationRef;
        }
        var cl = field.classList, future = this._validators[validationRef].apply(this, [field, this.form]);
        cl.add(LOADING_CLASS);
        future.then(() => {
            cl.remove(LOADING_CLASS);
        });
        return future;
    }


    /**
     * Run custom validations for elements, validations are done async do support XHR Requests or other stuff
     *
     * @param {Array|NodeList} fields
     * @returns {Promise} contains either true if validations passed or false if something went wrong
     * @private
     */
    _customValidationsForElements(fields) {
        var futures = [], fieldsLength = fields.length, checkedFields = [];
        for (var iVal = 0; iVal < fieldsLength; iVal++) {
            var field = fields[iVal], validationRef = field.getAttribute(ATTR_VALIDATOR), validity = field.validity;
            if (this._validators[validationRef]) {
                // use local validation first and then continue with custom validations
                if (!validity.customError && !validity.valid) {
                    continue;
                }
                checkedFields.push(field);
                futures.push(this._runValidation(validationRef, field));
            } else {
                if (validationRef) {
                    console.warn('data-validate was set but no validator was found');
                }
            }
        }
        return Promise.all(futures).then(function (allFutures) {
            let l = allFutures.length;
            let result = {
                checkedFields: checkedFields,
                foundAnyError: false
            };
            for (var fI = 0; fI < l; fI++) {
                if (!allFutures[fI]) {
                    result.foundAnyError = true;
                    break;
                }
            }
            return result;
        });
    }

    /**
     * Remove all errors for this form
     * @returns {Form}
     */
    removeErrors() {
        this._removeElementErrors(this.form);
        return this;
    }

    /**
     * Will handle errors for given fields
     * @param {Array|NodeList} fields
     * @param {Boolean} removeAllErrors
     */
    prepareErrors(fields, removeAllErrors) {
        if (removeAllErrors) {
            this._removeElementErrors(this.form);
        }
        // We save all validations in an extra property because we need to reset the validity due some
        // implementation errors in other browsers then chrome
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i], parent = field.parentNode, validity = field.validity;
            field.flexFormsSavedValidity = JSON.parse(JSON.stringify(validity));
            if (validity && !validity.valid) {
                if (!removeAllErrors) {
                    // Remove current errors:
                    this._removeElementErrors(parent);
                }
                // setup custom error messages:
                this._setupErrorMessages(field, validity);
                let msg = field.validationMessage;
                field.classList.add('invalid');
                field.setAttribute(ARIA_INVALID, 'true');
                if (this.options.appendError) {
                    parent.insertAdjacentHTML("beforeend", '<div class="' + ERROR_CLASS_NAME + '">' +
                    msg +
                    "</div>");
                }
                field.flexFormsSavedValidationMessage = msg;
            } else {
                field.classList.remove('invalid');
                field.setAttribute(ARIA_INVALID, 'false');

                this._removeElementErrors(parent);
            }
            // We have to reset the custom validity here to allow native validations work again
            field.setCustomValidity('');
        }
    }

    /**
     * Validates all custom fields
     * @returns {Promise}
     */
    validateCustomFields() {
        return this._customValidationsForElements(
            this.form.querySelectorAll("[data-validate]"));
    }

    /**
     * Creates an array from a node list with invalid items
     * On Firefox also Fieldset's seems to be invalid, remove them
     * @param list
     * @returns {Array}
     * @private
     */
    static _createArrayFromInvalidFieldList(list) {
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
     * This form
     * @returns {HTMLElement}
     */
    getForm() {
        return this.form;
    }

    /**
     * Registers a function that handles remote validation
     * @param {Function} func
     * @returns {Form}
     */
    registerRemoteValidation(func) {
        this._remoteValidationFunction = func;
        return this;
    }


    /**
     * Formats the error content for the tooltip
     * @param {String} error
     * @returns {String}
     * @private
     */
    static _formatErrorTooltip(error) {
        return '<i class="icon-attention"></i> ' + error;
    }

    /**
     * Creates a tooltip at given element, will only create a new instance if not created
     * @param {HTMLElement} target
     * @param {Boolean} [remove]
     */
    showAndOrCreateTooltip(target, remove) {

        var self = this;
        if (!this.tooltips && this.options.createTooltips) {
            this.tooltips = new Tooltip(this.getForm(), {
                containerClass: 'error-tooltip'
            });
        }

        if (!this.options.createTooltips) {
            return;
        }

        setTimeout(function () {
            if (!target.flexFormsSavedValidity) {
                return;
            }
            if (!target.flexFormsSavedValidity.valid && target.classList.contains(INPUT_ERROR_CLASS)) {
                self.tooltips.createTooltip(target,
                    Form._formatErrorTooltip(target.flexFormsSavedValidationMessage), false);
            } else {
                if (remove) {
                    self.tooltips.removeTooltip(target);
                }
            }
        }, 0);
    }

    /**
     * Handles invalid event of a form
     * @param {Event} e
     * @returns {Promise|boolean}
     * @private
     */
    _checkIsInvalid(e) {
        e.preventDefault();
        var invalidFields = this.getForm().querySelectorAll(":invalid"), self = this;
        var arr = Form._createArrayFromInvalidFieldList(invalidFields);
        // Prevent fire this N times:
        if (arr.indexOf(e.target) > 0) {
            return false;
        }
        // focus the first field:
        if (arr.length > 0) {
            setTimeout(function () {
                arr[0].focus();
                self.showAndOrCreateTooltip(arr[0]);
            }, 0);
        }

        var validation = self.validateCustomFields();
        this.prepareErrors(arr, true);
        return validation;
    }


    /**
     * Initializes validation for a given form, registers event handlers
     */
    initFormValidation() {
        // Suppress the default bubbles
        var form = this.getForm(), invalidFormFired = false, self = this;
        form.addEventListener("invalid", function (e) {
            var result = self._checkIsInvalid(e);
            if (result) {
                this.currentValidationFuture = new Promise((resolve) => {
                    result.then(function (r) {
                        self.prepareErrors(r.checkedFields, false);
                        resolve(r);
                        invalidFormFired = false;
                    });
                });
            }
        }, true);

        // handle focus out for text elements
        // Will show an error if field was invalid the first time
        form.addEventListener("blur", function (e) {
            if (self.tooltips) {
                self.tooltips.removeTooltip(e.target);
            }
            var target = e.target, hasError = false;

            if (!_checkIsValidBlurFocusElement(target)) {
                return;
            }

            if (target.classList.contains(INPUT_ERROR_CLASS)) {
                hasError = true;
            }
            self._customValidationsForElements([e.target]).then(function () {
                self.prepareErrors([e.target], false);
                if (!hasError) {
                    self.showAndOrCreateTooltip(e.target);
                }
            });

        }, true);

        /**
         * Validates if target is a valid input field to check blur and focus events
         *
         * @param {HTMLElement} target
         * @returns {boolean}
         */
        function _checkIsValidBlurFocusElement(target) {
            if (!self.options.inlineValidation) {
                return false;
            }

            var attr = target.getAttribute('type'), maybeDisableOnBlur = target.hasAttribute(ATTR_DISABLE_INLINE);
            if (maybeDisableOnBlur) {
                return false;
            }
            return !((attr === 'checkbox' || attr === 'option' || attr === 'submit' || !(target instanceof HTMLSelectElement || target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement)));
        }

        // handle focus on input elements
        // will show an error if field is invalid
        form.addEventListener("focus", function (e) {
            // do not track errors for checkbox and radios on focus:
            if (!_checkIsValidBlurFocusElement(e.target)) {
                return;
            }
            self.showAndOrCreateTooltip(e.target);
        }, true);

        // Handle change for checkbox, radios and selects
        form.addEventListener("change", function (e) {
            var name = e.target.getAttribute('name');
            if (name) {
                var inputs = form.querySelectorAll('[name="' + name + '"]');
                self._customValidationsForElements(inputs).then(function () {
                    self.prepareErrors(inputs, false);
                    self.showAndOrCreateTooltip(e.target, true);
                });
            }
        });

        // prevent default if form is invalid
        var submitListener = function (e) {
            self._submitListener(e, submitListener);
        };
        form.addEventListener("submit", submitListener);

        Event.dispatchAndFire(form, EVENT_FORM_READY);
    }

    /**
     * Listener that is executed on form submit
     * @param e
     * @param submitListener
     * @returns {boolean}
     * @private
     */
    _submitListener(e, submitListener) {

        var form = this.getForm(), self = this;

        if (form.classList.contains(LOADING_CLASS)) {
            e.preventDefault();
            return false;
        }

        form.classList.add(LOADING_CLASS);
        form.removeEventListener("submit", submitListener);
        this._removeElementErrors(form);
        e.preventDefault();
        // reset:
        if (form.checkValidity()) {
            form.addEventListener("submit", submitListener);
            // Custom validations did never pass
            self.currentValidationFuture = new Promise((resolve) => {

                var validation = self.validateCustomFields();
                validation.then(function (r) {
                    // focus first invalid field:
                    for (var i = 0; i < r.checkedFields.length; i++) {
                        var f = r.checkedFields[i];
                        if (!f.validity.valid) {
                            // Focus element and show tooltip, we explicitly showing tooltip here, because
                            // element might have focus already
                            self.showAndOrCreateTooltip(f, true);
                            f.focus();
                            break;
                        }
                    }
                    self.prepareErrors(r.checkedFields, false);
                    resolve(r);
                });
            });
            self.currentValidationFuture.then(function (r) {
                form.classList.remove(LOADING_CLASS);
                if (!r.foundAnyError) {
                    // Handle submitting the form to server:
                   self._handleSubmit(e);
                }
            });
        } else {
            form.classList.remove(LOADING_CLASS);
            form.addEventListener("submit", submitListener);
        }
    }


    /**
     * Handles submitting, optionally allows to stop submitting
     * @param e
     * @private
     */
    _handleSubmit(e) {
        this._submitFunction(this.form, e);
    }


    /**
     * Registers a global event Handler
     * @param errorFunc
     */
    static registerErrorMessageHandler(errorFunc) {
        Form.globalErrorMessageHandler = errorFunc;
    }

    /**
     * Initialize forms for a specific selector
     * @param {String} selector
     * @param {Object} [options]
     */
    static init(selector, options) {
        var forms = selector instanceof HTMLElement ? selector.querySelectorAll('form') :
            document.querySelectorAll(selector);
        for (var i = 0; i < forms.length; i++) {
            new Form(forms[i], options);
        }
    }


    /**
     * Registers a global validator that is usable on all form instances
     * @param {String} name
     * @param {Function} validator
     * @returns {Function}
     */
    static registerValidator(name, validator) {
        Form.globalValidators[name] = validator;
        return Form;
    }

    /**
     * Registers a global function that is called when a form should validate the response of a server
     * @param {Function} func
     * @returns {Form}
     */
    static registerGlobalRemoteValidationFunction(func) {
        Form.globalRemoteValidationFunction = func;
        return Form;
    }
}


/**
 * Global validators
 * @type {Array}
 */
Form.globalValidators = [];

/**
 * Global Remote validation function
 */
Form.globalRemoteValidationFunction = function () {
};

/**
 * Handles custom error messages extracts custom message by default
 */
Form.globalErrorMessageHandler = (field, validity) => {
    if (!validity.customError) {
        let customMsg = field.getAttribute(ATTR_DATA_CUSTOM_MESSAGE);
        if (customMsg) {
            field.setCustomValidity(customMsg);
        }
    }
};