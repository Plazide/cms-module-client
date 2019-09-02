import "../css/toolbar.css";
import langs from "../locale.json";
import EventEmitter from "events";
import {
	getSelectorPath,
	navigateViaLink,
	getTopParent,
	appendTools,
	saveSelection,
	applySelection,
	promptUser,
	renderGhostPrompt,
	getShortcut,
	findSection,
	findChangedSections,
	setCookie,
	getCookie
} from "./lib/util";

/**
 * The CMS client class. It enables the WYSIWYG editor.
 */
class CMS extends EventEmitter{
	/**
	 * Create an instance of the CMS client.
	 * @param {object} [options] - An object containing options for the CMS class.
	 * @param {string} [options.lang] - The language that will be displayed in the editor.
	 * @param {string[]} [options.tags] - An array of html tags that should be editable. It takes the name of tags, such as "span" or "a", not specific html elements.
	 * @param {string} [options.saveUrl] - The endpoint where the client will send the edited content to be saved.
	 * @param {string} [options.publishUrl] - The endpoint where the client will send a request to make the saved content public.
	 * @param {string} [options.uploadUrl] - The endpoint where images will be sent.
	 */
	constructor ({
		editorLang = "en",
		tags = [],
		saveUrl = "/cms/save",
		publishUrl = "/cms/publish",
		uploadUrl = "/cms/upload",
		auth = ""
	}){
		super();

		if(!Array.isArray(tags) && tags) throw new TypeError("tags is not an array");

		this.locale = langs[editorLang] || langs.en;
		this.tags = ["a", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"].concat(tags);
		this.saveUrl = saveUrl;
		this.publishUrl = publishUrl;
		this.uploadUrl = uploadUrl;
		this.auth = auth;
		this.sections = [];
		this.childTags = ["li", "b", "i", "span", "u", "strike", "a"];
		this.shortcuts = [
			{
				name: this.locale.shortcuts.save.name,
				combo: this.locale.shortcuts.save.combo,
				func: (e) => this.save(e),
				global: true
			},
			{
				name: this.locale.shortcuts.bold.name,
				combo: this.locale.shortcuts.bold.combo,
				func: this._makeBold
			},
			{
				name: this.locale.shortcuts.italic.name,
				combo: this.locale.shortcuts.italic.combo,
				func: this._makeItalic
			},
			{
				name: this.locale.shortcuts.underline.name,
				combo: this.locale.shortcuts.underline.combo,
				func: this._makeUnderline
			},
			{
				name: this.locale.shortcuts.linethrough.name,
				combo: this.locale.shortcuts.linethrough.combo,
				func: this._makeLinethrough
			},
			{
				name: this.locale.shortcuts.link.name,
				combo: this.locale.shortcuts.link.combo,
				func: (e) => this._insertLink(e)
			}
		];

		this._handleShortcuts();
	}

	/*
	****************
	PUBLIC METHODS
	****************
	*/

	/**
	 * Start the CMS interface.
	 */
	run (){
		// Find all editable elements.
		const tags = this.tags.join(", ");
		const elements = [...document.querySelectorAll(tags)];

		// Add listeners to all the editable elements.
		for(const el of elements){
			const cmsElement = {
				original_text: el.innerHTML,
				edited_text: el.innerHTML,
				saved_text: el.innerHTML,
				element: el,
				path: getSelectorPath(el),
				page: window.location.pathname
			};
			this.sections.push(cmsElement);

			el.addEventListener("click", (e) => this._addEdit(e));
			el.classList.add("cms-editable");
		}

		this._renderToolbar();

		// Render the prompt, but make it hidden, to avoid recreating it every time it is needed.
		renderGhostPrompt(this.locale);

		window.addEventListener("mousedown", (e) => this._removeEdit(e));
	}

	async save (){
		const hasChanged = this._changedSinceSave();

		if(!hasChanged) return;
		const changedSections = findChangedSections(this.sections);

		document.body.style.cursor = "wait";
		const response = await fetch(this.saveUrl, {
			method: "POST",
			json: true,
			headers: {
				"Content-Type": "application/json"

			},
			body: JSON.stringify(changedSections)
		});

		// When the request fails, show an error!
		if(!response.ok) this._error(this.locale.errors.save);

		// When the request succeeds, update the saved sections!
		if(response.ok) this._setSaved(changedSections);

		document.body.style.cursor = "auto";
	}

	async publish (){
		const hasChanged = this._changedSincePublish();

		if(!hasChanged) return;
		const sections = this.sections;

		document.body.style.cursor = "wait";
		const response = await fetch(this.publishUrl, {
			method: "POST",
			json: true,
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(sections)
		});

		// When the request fails, show an error!
		if(!response.ok) this._error(this.locale.errors.publish);

		// When the request succeeds, update sections!
		if(response.ok) this._setPublished();

		document.body.style.cursor = "auto";
	}

	/*
	****************
	PRIVATE METHODS
	****************
	*/

	_error (msg){
		console.error(msg);
	}

	_setPublishStatus (){
		const hasChanged = this._changedSincePublish();
		const button = document.querySelector(".cms-publish");

		if(!hasChanged)
			button.setAttribute("disabled", "true");
		else if(hasChanged)
			button.removeAttribute("disabled");
	}

	_changedSincePublish (){
		const sections = this.sections;

		for(let section of sections)
			if(section.saved_text !== section.original_text)
				return true;

		return false;
	}

	_setPublished (){
		const sections = this.sections;

		for(let section of sections)
			section.original_text = section.saved_text;

		this._setPublishStatus();
	}

	/**
	 * Sets the status of the save button, whether it is disabled or not.
	 */
	_setSaveStatus (){
		const hasChanged = this._changedSinceSave();
		const saveButton = document.querySelector(".cms-save");

		if(!hasChanged)
			saveButton.setAttribute("disabled", "true");
		else if(hasChanged)
			saveButton.removeAttribute("disabled");
	}

	/**
	 * Checks whether or not changes have been made since the last save.
	 * @returns {boolean} - True means that changes have been made. False means no changes have been made.
	 */
	_changedSinceSave (){
		const sections = this.sections;

		for(let section of sections)
			if(section.edited_text !== section.saved_text)
				return true;

		return false;
	}

	_setSaved (changedSections){
		const sections = this.sections;

		for(let section of sections){
			const element = section.element;

			changedSections.forEach( changedSection => {
				if(changedSection.element === element)
					section.saved_text = changedSection.edited_text;
			});
		}

		this._setSaveStatus();
		this._setPublishStatus();
	}

	/**
	 * Sets the edited content in a section.
	 * @param {string} element - An editable element
	 */
	_setEdits (element){
		const content = element.innerHTML;
		const section = findSection(element, this.sections);

		section.edited_text = content;
		this._setSaveStatus();
	}

	/**
	 * Handle all shortcuts.
	 */
	_handleShortcuts (){
		document.onkeydown = (e) => {
			const combo = [];
			const ctrl = e.ctrlKey;
			const shift = e.shiftKey;
			const alt = e.altKey;
			const key = e.key.toLowerCase();
			const isInputContext = e.target.classList.contains("cms-editable");

			if(ctrl)
				combo.push("ctrl");

			if(shift)
				combo.push("shift");

			if(alt)
				combo.push("alt");

			combo.push(key);
			const shortcut = getShortcut(this.shortcuts, combo);

			if(shortcut !== false)
				if(isInputContext || shortcut.global){
					e.stopImmediatePropagation();
					e.preventDefault();

					if(e.repeat) return;

					shortcut.func(e);
				}
		};
	}

	/**
	 * Render the global toolbar.
	 * @private
	 */
	_renderToolbar (){
		const body = document.body;
		const toolbar = document.createElement("div");
		const publish = this._createBtn({ name: "publish", handler: () => this.publish() });
		const save = this._createBtn({ name: "save", handler: () => this.save() });
		const langs = this._createDropdown({
			name: "langs",
			options: [
				{
					name: "Svenska",
					value: "sv"
				},
				{
					name: "English",
					value: "en"
				},
				{
					name: "Nederlands",
					value: "nl"
				}
			],
			handler: (e) => this._changeLanguage(e)
		});

		// The order of this array determines the order in which the tools are displayed.
		const tools = [langs, save, publish];

		body.classList.add("cms-active");
		toolbar.classList.add("cms-toolbar");

		appendTools(tools, toolbar);
		body.appendChild(toolbar);

		this._setSaveStatus();
		this._setPublishStatus();
	}

	/**
	 * Add a local toolbar to an HTMLElement.
	 * @param {HTMLElement} el - The HTMLElement to a toolbar to.
	 * @private
	 */
	_addLocalToolbar (el){
		const body = document.body;
		const tbHeight = 40;
		const tbWidth = 200;

		const toolbar = document.createElement("div");
		toolbar.classList.add("local-toolbar");

		function setPosition (){
			const elHeight = el.getBoundingClientRect().height;
			let elPosY = el.getBoundingClientRect().top - body.getBoundingClientRect().top + elHeight + 10,
				elPosX = el.getBoundingClientRect().left;

			// If the toolbar exceeds the width or height of the page,
			// move it so that the whole toolbar can be displayed.
			const tbViewPos = (el.offsetTop + elHeight + 80);
			const view = window.innerHeight;
			if(elPosX + tbWidth > window.innerWidth)
				elPosX = (window.innerWidth - tbWidth) - 5;

			if(tbViewPos > view)
				elPosY = el.offsetTop - tbHeight - 10;

			toolbar.style.setProperty("top", elPosY + "px");
			toolbar.style.setProperty("left", elPosX + "px");
			toolbar.style.setProperty("height", tbHeight + "px");
			toolbar.style.setProperty("width", tbWidth + "px");
		}
		setPosition();

		this._addTools(toolbar);

		// Only add a local toolbar if another one does not exist.
		if(!document.querySelector(".local-toolbar"))
			body.appendChild(toolbar);

		el.addEventListener("input", setPosition);

		return toolbar;
	}

	/**
	 * Add buttons to a local toolbar.
	 * @param {HTMLElement} toolbar - The toolbar to add buttons to.
	 * @private
	 */
	_addTools (toolbar){
		const bold = this._createBtn({ name: "bold", handler: this._makeBold });
		const italic = this._createBtn({ name: "italic", handler: this._makeItalic });
		const underline = this._createBtn({ name: "underline", handler: this._makeUnderline });
		const linethrough = this._createBtn({ name: "linethrough", handler: this._makeLinethrough });
		const link = this._createBtn({ name: "link", handler: (e) => this._insertLink(e) });
		const unlink = this._createBtn({ name: "unlink", handler: this._unlink });

		const tools = [bold, italic, underline, linethrough, link, unlink];

		appendTools(tools, toolbar);
	}

	/**
	 * Adds a local toolbar and highlighting around an element.
	 * @param {Event} e - An event object
	 * @private
	 */
	_addEdit (e){
		const el = getTopParent(e.target, this.tags) || e.target;
		const ctrl = e.ctrlKey;

		if(ctrl && el.localName === "a")
			navigateViaLink(el);

		el.setAttribute("contenteditable", true);
		el.focus();
		el.classList.add("outline");

		this._addLocalToolbar(el);
	}

	/**
	 * Removes the local toolbar and highlighting around an element
	 * @param {Event} e - An event object
	 * @private
	 */
	_removeEdit (e){
		const target = e.target;
		const el = document.querySelector(".cms-editable[contenteditable=true]");
		const localToolbar = document.querySelector(".local-toolbar");

		if(
			target === localToolbar ||
			target.classList.contains("cms-btn") ||
			target === el ||
			document.querySelector(".cms-prompt-container.show")
		) return false;

		// Remove the localToolbar, but only if one exists.
		if(document.querySelector(".local-toolbar"))
			document.body.removeChild(localToolbar);

		// Remove editable attribute and highlighting.
		if(el){
			el.removeAttribute("contenteditable");
			el.classList.remove("outline");
		}

		// Set save edited content.
		if(el)
			// const path = getSelectorPath(el);
			this._setEdits(el);
	}

	/**
	 * Create a button.
	 * @param {object} options - Options to pass to create the button.
	 * @param {string} options.name - The name of the button, should correspond to a name in the locale file.
	 * @param {function} options.handler - The functions that fires when the button is pressed.
	 * @returns {HTMLElement}
	 * @private
	 */
	_createBtn ({ name, handler }){
		const title = this.locale.tooltips[name];
		const shortcut = this.locale.shortcuts[name];
		const combo = shortcut ? ` (${shortcut.combo.join("+")})` : "";

		const btn = document.createElement("button");
		btn.setAttribute("title", title + combo);
		btn.classList.add("cms-" + name);
		btn.classList.add("cms-btn");
		btn.addEventListener("mousedown", handler);

		return btn;
	}

	_createDropdown ({ name, options, handler }){
		const title = this.locale.tooltips[name];
		const con = document.createElement("div");
		const icon = document.createElement("label");
		const dropdown = document.createElement("select");
		const currentLang = getCookie("lang");

		con.classList.add("change-lang-con");
		con.setAttribute("title", title);
		icon.classList.add("cms-langs");
		icon.classList.add("cms-btn");
		icon.setAttribute("for", "cms-lang");
		dropdown.setAttribute("id", "cms-lang");

		options.forEach( option => {
			const opt = document.createElement("option");

			if(option.value === currentLang)
				opt.setAttribute("selected", "");

			opt.innerText = option.name;
			opt.value = option.value;

			dropdown.appendChild(opt);
		});

		con.appendChild(icon);
		con.appendChild(dropdown);
		dropdown.addEventListener("change", handler);

		return con;
	}

	_changeLanguage (e){
		const target = e.target;
		const value = target.value;

		setCookie("lang", value);
		window.location.reload();
	}

	/**
	 * Make the selected text bold.
	 * @private
	 */
	_makeBold (){
		document.execCommand("bold");
	}

	/**
	 * Make the selected text italic.
	 * @private
	 */
	_makeItalic (){
		document.execCommand("italic");
	}

	/**
	 * Make the selected text underlined.
	 * @private
	 */
	_makeUnderline (){
		document.execCommand("underline");
	}

	/**
	 * Make the selected text have a line through it.
	 * @private
	 */
	_makeLinethrough (){
		document.execCommand("strikeThrough");
	}

	/**
	 * Remove anchor tag from selected text.
	 * @private
	 */
	_unlink (){
		document.execCommand("unlink");
	}

	/**
	 * Make the selected text into a link.
	 * @param {Event} e - An event object from clicking the insert link button.
	 */
	async _insertLink (e){
		e.preventDefault();
		e.stopImmediatePropagation();
		const titleText = this.locale.prompt.link;
		const cmdText = "createLink";
		const type = "link";

		const savedSelection = saveSelection();
		if(!savedSelection) return;

		const link = await promptUser(titleText, type);
		applySelection(savedSelection);

		if(link)
			document.execCommand(cmdText, false, link);
	}
}

export default CMS;
