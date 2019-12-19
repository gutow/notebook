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
    ) {
    "use strict";
    function encodeURIandParens(uri){return encodeURI(uri).replace('(','%28').replace(')','%29')}

    var Cell = cell.Cell;

    //at bottom will be replacement functions for notebook calls to codemirror that should not exist, 
    //there should be generic editor calls if you insist on linking them together but do not use a specific editor as the core of the notebook
    
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
        
        this.placeholder = 'To Edit this cell double click in it.';
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
     * Subclasses can implement override bind_events.
     * Be careful to call the parent method when overwriting as it fires event.
     * this will be triggered after create_element in constructor.
     * @method bind_events
     */
    WYSIWYGCell.prototype.bind_events = function () {
    	Cell.prototype.bind_events.apply(this);
    	var that = this;
        // We trigger events so that Cell doesn't have to depend on Notebook.
        that.element.click(function (event) {
            that._on_click(event);
        });
        if (this.editor) {
            this.onfocus = function () {
            	that.events.trigger('select.Cell', {'cell':that});
                that.events.trigger('edit_mode.Cell', {cell: that});
                //this replaces codemirrors focus event
            }
            };
        if (this.editor) {
            this.onblur = function() {
                that.events.trigger('command_mode.Cell', {cell: that});
               //this replaces codemirrors blur event
            };
        };
        this.element.dblclick(function () {
            var cont = that.unrender();
            if (cont) {
                that.select();
            }
            //this overrides cells doubleclick event in order to allow for the reselecting of a rendered cell
        });
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
        var inner_cell = $('<div/>').addClass('inner_cell ql-snow');
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
        input_area.classList.add('tex2jax_ignore');
        inner_cell.append(input_area);
        input_area.innerHTML=' \n'; //make sure the div has some content for quill
                                   // to start with.
        //Set up the menu options for the editor
        var toolbarOptions = [
        	['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        	[{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        	[{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
        	[{ 'font': [] }],
        	[{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
        	
        	//  [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        	[{ 'list': 'ordered'}, { 'list': 'bullet' }],
        	[{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        	['link'],											// insert link
        	['image'],										//insert image
        	['blockquote', 'code-block'],
        	
        	[{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        	
        	[{ 'align': [] }],
        	[{ 'direction': 'rtl' }],                         // text direction
        	
        	['clean']                                         // remove formatting button
        ];
        this.editor = new Quill(input_area, {
                 modules:{
                    toolbar: toolbarOptions
                },
                theme: 'snow'
            });
 
        this.editor.on('editor-change', function (eventName, args){
    			if (eventName == 'selection-change'){
    			    // and (eventName == 'selection-change') and (args[0].length >=0)
    			    //we're in the cell and (args[0].length >=0)
    			    if ((args!=null) && (Range.length >=0)) {
    			    	if (!that.selected) {
    			        that.events.trigger('select.Cell', {'cell':that});
    			        	}
    			     if(notebook.mode != 'edit') {
    			        that.events.trigger('edit_mode.Cell', {cell: that});
    			     		}
                        }
                    }
                //otherwise already selected or blurred so do nothing.
        });
         //codemirror monkeypatch overrides on calls from notebook

    		this.code_mirror = function() {
    			null;	
    			//overiding codemirror so it doesn't call the wrong thing
    		};
    		this.code_mirror.getInputField = function() {
    			return input_area;
    			//replacing the codemirror call
    		};
    		this.code_mirror.getInputField.blur = function() {
    			that.handle_command_mode(data.cell);
    			//replacing the codemirror call that set a cell to command mode
    		};
    		this.code_mirror.refresh = function() {
    			null;	
    			//replacing a codemirror call intended to check if the cell 
    			//had been resized, not an issue with Quill
    		};
    		this.code_mirror.getCursor = function(){
    		    //overiding code_mirror.getCursor call
    		    //odd this function appear to be called after the cell is
    		    //destroyed. Make that.editor undefined!
    		    // var index = that.editor.getSelection().index;
    		    //TODO: Now it gets a bit messy. To duplicate the object CodeMirror
    		    // returns we need to count line breaks before this index and
    		    // calculate a relative index from the beginning of the line
    		    // the cursor is in
    		    // for now returning beginning
    		    let pos = {line: 0, ch: 0};
    		    return(pos);
    		};
    		this.code_mirror.setCursor = function(pos){
    		    //overiding code_mirror.setCursor call
    		    // TODO: as code_mirror sends a line and offset from beginning of 
    		    // line this will have to be translated into an index from
    		    // beginning of editor contents.
    		    //presently doing nothing.
    		};
    		this.code_mirror.setOption = function(option, spec){
    		    //overiding code_mirror.setOption call.
    		    // Nothing adjustable on the fly for this editor.
    		    // Do nothing.
    		};
    		this.code_mirror.clearHistory = function(){
    		    //overiding code_mirror.clearHistory call
    		    that.editor.history.clear();
    		};
     		this.code_mirror.on = function(cm, change) {
     			//overiding codemirror.on to prevent it from running
     		}; 
    	//end monkeypatch overrides

        // The tabindex=-1 makes this div focusable.
        var render_area = $('<div/>').addClass('text_cell_render rendered_html ql-editor')
            .attr('tabindex','-1').attr('contenteditable','false');
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

    WYSIWYGCell.prototype.unrender = function () {
        var cont = Cell.prototype.unrender.apply(this);
        if (cont) {
            if (this.get_text() === this.placeholder) {
                this.set_text('');
            }
            this.element.addClass('unrendered');
            this.element.removeClass('rendered');
            this.rendered = false;
            //unhides the editor for a cell
        }
        return cont;
    };

    WYSIWYGCell.prototype.execute = function () {
        this.render();
    };
    
    /**
     * @method render
     */
    WYSIWYGCell.prototype.render = function () {
    	var cont = Cell.prototype.render.apply(this);
    	if (cont) {
    		var that = this;
    		var html = this.editor.root.innerHTML;
    		//TODO handle empty cell by putting in instructions to double click to edit.
    		//TODO needed? var text_and_math=mathjaxutils.remove_math(html); 
    		html=$(security.sanitize_html_and_parse(html));
    		that.unrender();
            that.set_rendered(html);
            //only apply math typesetting to the rendered text.
            var torender = that.element.find('div.text_cell_render');
            utils.typeset(torender);
            that.element.addClass('rendered');
            that.element.removeClass('unrendered');
            that.rendered = true;
    	}
        return cont;
        //hides the editor and formats the cells contents
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


    WYSIWYGCell.prototype.select = function (moveanchor) {
    	var that = this;
    	// if anchor is true, set the move the anchor
        moveanchor = (moveanchor === undefined)? true:moveanchor;
        if(moveanchor){
            this.anchor=true;
        }

        if (!this.selected) {
            this.element.addClass('selected');
            this.element.removeClass('unselected');
            this.selected = true;
            // disable 'insert image' menu item (specific cell types will enable
            // it in their override select())
            this.notebook.set_insert_image_enabled(false);
            if(this.mode != 'edit') {
            	this.mode='edit'
            	that.events.trigger('edit_mode.Cell', {cell: that});
            }
            return true;
        } else {
            return false;
        }
    }
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
                this.editor.clipboard.dangerouslyPasteHTML(data.source);
                //old behavior using Delta format
                //this.editor.setContents(data.source);
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
        data.source = this.editor.root.innerHTML;
        //old behavior, delta stored in JSON
        //data.source = this.editor.getContents();
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
/* DON'T CREATE EXTRA BUTTON, WILL KEEP CODE UNTIL READY TO FOLD INTO ROOT PROJECT.
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
//create the toWYSIWYG button, may eventually replace it with a menu option
}

toWYSIWYG();

function to_WYSIWYG_cell() {
    //turns the selected cell into a WYSIWYG cell
	var source_cell = Jupyter.notebook.get_selected_cell();
	var source_index = Jupyter.notebook.get_selected_index();
	var target_cell = Jupyter.notebook.insert_cell_below('WYSIWYG', source_index);
	var text = source_cell.get_text();
	if (text == source_cell.placeholder) {
		text = target_cell.placeholder;	
	}
	//TODO be smart about getting data form other cell types:
	//    from markdown want the rendered HTML so format not lost
	//    from code cells:
	//        1)if begins with %%html magic transfer the rest of the contents as
	//            html.
	//        2)if not html transfer as normal.
	//    from rawNBconvert
	//        1) try to determine if it is html code, if so transfer as html.
	//        2) otherwise tranfer text.
	//Should also make sure not to convert a cell that is already WYSIWYG.
	target_cell.metadata = source_cell.metadata;
	target_cell.attachments = source_cell.attachments
	target_cell.editor.setText(text);
	source_cell.element.remove();
	target_cell.unrender();
}
*/
