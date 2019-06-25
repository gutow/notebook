// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

define([
    'jquery',
    'base/js/utils',
    'base/js/i18n',
    'notebook/js/cell',
    'base/js/security',
    'services/config',
    'notebook/js/mathjaxutils',
    'notebook/js/celltoolbar',
    'components/marked/lib/marked',
    'codemirror/lib/codemirror',
    'codemirror/mode/gfm/gfm',
    'notebook/js/codemirror-ipythongfm',
//    'components/quill/quill.min' This should be required, but does not play well
//                                  with requirejs, so loaded in head of page.
], function(
    $,
    utils,
    i18n,
    cell,
    security,
    configmod,
    mathjaxutils,
    celltoolbar,
    marked,
    CodeMirror,
    gfm,
    ipgfm,
    ) {
    "use strict";
    function encodeURIandParens(uri){return encodeURI(uri).replace('(','%28').replace(')','%29')}

    var Cell = cell.Cell;

    var WYSIWYGCell = function (options) {
        /**
         * Constructor
         *
         * Construct a new WYSIWYGCell, codemirror mode is by default 'htmlmixed', 
         * and cell type is 'text' cell start as not redered.
         *
         * Parameters:
         *  options: dictionary
         *      Dictionary of keyword arguments.
         *          events: $(Events) instance 
         *          config: dictionary
         *          keyboard_manager: KeyboardManager instance 
         *          notebook: Notebook instance
         */
        options = options || {};

        // in all WYSIWYGCell/Cell subclasses
        // do not assign most of members here, just pass it down
        // in the options dict potentially overwriting what you wish.
        // they will be assigned in the base class.
        this.notebook = options.notebook;
        this.events = options.events;
        this.config = options.config;

        // we cannot put this as a class key as it has handle to "this".
        Cell.apply(this, [{
                    config: options.config, 
                    keyboard_manager: options.keyboard_manager, 
                    events: this.events}]);

        this.cell_type = this.cell_type || 'WYSIWYG';
        mathjaxutils = mathjaxutils;
        this.rendered = false;
    };

    WYSIWYGCell.prototype = Object.create(Cell.prototype);

    WYSIWYGCell.options_default = {
        cm_config : {
            mode: 'htmlmixed',
            lineWrapping : true,
        }
    };


    /**
     * Create the DOM element of the WYSIWYGCell
     * @method create_element
     * @private
     */
    WYSIWYGCell.prototype.create_element = function () {
        Cell.prototype.create_element.apply(this, arguments);
        var that = this;

        var cell = $("<div>").addClass('cell WYSIWYG');
        cell.attr('tabindex','2');

        var prompt = $('<div/>').addClass('prompt input_prompt');
        cell.append(prompt);
        var inner_cell = $('<div/>').addClass('inner_cell');
        this.celltoolbar = new celltoolbar.CellToolbar({
            cell: this, 
            notebook: this.notebook});
        inner_cell.append(this.celltoolbar.element);
        // need to use full dom constructors, the partially made object
        // created by jquery $ does not have all the attributes quill needs.
        //var input_area = $('<div/>').addClass('input_area WYSIWYG' );
        var input_area = document.createElement('div');
        input_area.classList.add('input_area');
        input_area.classList.add('WYSIWYG');
        inner_cell.append(input_area);
        input_area.innerHTML=' \n'; //make sure the div has some content for quill
                                   // to start with.
        this.editor = new Quill(input_area, {
/*                 modules:{
                    toolbar: toolbarOptions
                },
 */                theme: 'snow'
            });
        // In case of bugs that put the keyboard manager into an inconsistent state,
        // ensure KM is enabled when quill is focused:
        //this.editor.on('keydown', $.proxy(this.handle_keyevent,this))  keydown is not an event emitted by quill...
        // The tabindex=-1 makes this div focusable.
        var render_area = $('<div/>').addClass('text_cell_render rendered_html')
            .attr('tabindex','-1');
        inner_cell.append(input_area).append(render_area);
        cell.append(inner_cell);
        this.element = cell;
        this.inner_cell = inner_cell;
        that.events.trigger('edit_mode.Cell', {cell: that});
    };


    // Cell level actions

    WYSIWYGCell.prototype.add_attachment = function (key, mime_type, b64_data) {
        /**
         * Add a new attachment to this cell
         */
        this.attachments[key] = {};
        this.attachments[key][mime_type] = b64_data;
    };

    WYSIWYGCell.prototype.select = function () {
         var cont = Cell.prototype.select.apply(this, arguments);
         if (cont) {
            if (this.mode === 'edit') {
                this.editor.focus();
            }
        } 
        return cont;
    };

    WYSIWYGCell.prototype.unrender = function () {
        var cont = Cell.prototype.unrender.apply(this);
        if (cont) {
            var text_cell = this.element;
            if (this.get_text() === this.placeholder) {
                this.set_text('');
            }
        }
        return cont;
    };

    WYSIWYGCell.prototype.execute = function () {
        this.render();
    };

    /**
     * setter: {{#crossLink "WYSIWYGCell/set_text"}}{{/crossLink}}
     * @method get_text
     * @retrun {string} CodeMirror current text value
     */
    WYSIWYGCell.prototype.get_text = function() {
        return this.editor.getText();
    };

    /**
     * @param {string} text - Codemiror text value
     * @see WYSIWYGCell#get_text
     * @method set_text
     * */
    WYSIWYGCell.prototype.set_text = function(text) {
        this.editor.setText(text);
        this.unrender();
        //this.code_mirror.refresh();
    };

    /**
     * setter :{{#crossLink "WYSIWYGCell/set_rendered"}}{{/crossLink}}
     * @method get_rendered
     * */
    WYSIWYGCell.prototype.get_rendered = function() {
        return this.element.find('div.text_cell_render').html();
    };

    /**
     * @method set_rendered
     */
    WYSIWYGCell.prototype.set_rendered = function(text) {
        this.element.find('div.text_cell_render').html(text);
    };


    /**
     * Create Text cell from JSON
     * @param {json} data - JSON serialized text-cell
     * @method fromJSON
     */
    WYSIWYGCell.prototype.fromJSON = function (data) {
        Cell.prototype.fromJSON.apply(this, arguments);
        if (data.cell_type === this.cell_type) {
            if (data.attachments !== undefined) {
                this.attachments = data.attachments;
            }

            if (data.source !== undefined) {
                this.set_text(data.source);
                // make this value the starting point, so that we can only undo
                // to this state, instead of a blank cell
                //this.tinymce.UndoManager.clear();
                // TODO: This HTML needs to be treated as potentially dangerous
                // user input and should be handled before set_rendered.
                this.set_rendered(data.rendered || '');
                this.rendered = false;
                this.render();
            }
        }
    };

    /** Generate JSON from cell
     * @param {bool} gc_attachments - If true, will remove unused attachments
     *               from the returned JSON
     * @return {object} cell data serialised to json
     */
    WYSIWYGCell.prototype.toJSON = function (gc_attachments) {
        if (gc_attachments === undefined) {
            gc_attachments = false;
        }

        var data = Cell.prototype.toJSON.apply(this);
        data.source = this.get_text();
        if (data.source == this.placeholder) {
            data.source = "";
        }

        // We deepcopy the attachments so copied cells don't share the same
        // objects
        if (Object.keys(this.attachments).length > 0) {
            if (gc_attachments) {
                // Garbage collect unused attachments : The general idea is to
                // render the text, and find used attachments like when we
                // substitute them in render()
                var that = this;
                data.attachments = {};
                // To find attachments, rendering to HTML is easier than
                // searching in the markdown source for the multiple ways you
                // can reference an image in markdown (using []() or a
                // HTML <img>)
                var text = this.get_text();
                marked(text, function (err, html) {
                    html = $(security.sanitize_html_and_parse(html));
                    html.find('img[src^="attachment:"]').each(function (i, h) {
                        h = $(h);
                        var key = h.attr('src').replace(/^attachment:/, '');
                        if (that.attachments.hasOwnProperty(key)) {
                            data.attachments[key] = JSON.parse(JSON.stringify(
                                that.attachments[key]));
                        }

                        // This is to avoid having the browser do a GET request
                        // on the invalid attachment: URL
                        h.attr('src', '');
                    });
                });
                if (data.attachments.length === 0) {
                    // omit attachments dict if no attachments
                    delete data.attachments;
                }
            } else {
                data.attachments = JSON.parse(JSON.stringify(this.attachments));
            }
        }
        return data;
    };

    var WYSIWYGCell = {
        WYSIWYGCell: WYSIWYGCell,
    };
    return WYSIWYGCell;
});

function toWYSIWYG() {
	if(!document.getElementById('toWYSIWYGbtn')) {
		var newselect=document.createElement('button');
		newselect.id = 'toWYSIWYGbtn';
		newselect.innerHTML = "toWYSIWYGbtn";
		newselect.onclick = function() {
			to_WYSIWYG_cell();
		}
	document.getElementById('maintoolbar-container').appendChild(newselect);
	}

}

toWYSIWYG();

function to_WYSIWYG_cell() {
	var source_cell = Jupyter.notebook.get_selected_cell();
	var source_index = Jupyter.notebook.get_selected_index();
	var target_cell = Jupyter.notebook.insert_cell_below('WYSIWYG', source_index);
	var text = source_cell.get_text();
	if (text == source_cell.placeholder) {
		text == ' ';	
	}
	target_cell.metadata = source_cell.metadata;
	target_cell.attachments = source_cell.attachments
	target_cell.content = text;
//	target_cell.tinymce.UndoManager.clear();
	source_cell.element.remove();
}