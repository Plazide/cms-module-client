import "./css/toolbar.css";
import langs from "./lang.json";

class CMS{
	constructor({ lang, tags }){
		if(!Array.isArray(tags) && tags) throw new TypeError("tags option needs to be an array.");
		if(!lang) lang = "en";

		this.tags = [
			"a",
			"p",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"ul",
			"ol"
		];
		this.sections = [];

		// Set the language. If a language code is not provided or is unvalid, english will be used a default.
		this.text = langs[lang];

		// Add the custom tags to the tags array if such an options was provided.
		if(tags)
			tags.forEach( (tag) => {
				if(this.tags.indexOf(tag) === -1)
					if(typeof tag === "string")
						this.tags.push(tag);
					else
						throw new TypeError("tags option needs to be an array of strings");
				else
					console.warn("The " + tag + " tag is a default editable tag. Passing it in the tags array is unnecessary.");
			});
	}

	run(){
		const tags = this.tags.join(", ");
		const elements = document.querySelectorAll(tags);

		for(const el of elements){
			const cmsElement = {
				original_text: el.innerText,
				edited_text: "",
				path: getSelectorPath(el),
				page: window.location.pathname
			};

			// Save initial state of element.
			this.sections.push(cmsElement);

			el.addEventListener("click", (e) => {
				this.edit(e);
			});

			el.addEventListener("keydown", (e) => {
				this.onKeydown(e);
			});
		}

		this.renderToolbar();
	}

	renderToolbar(){
		const toolbar = document.createElement("div");
		toolbar.setAttribute("id", "cms-toolbar");

		const flex = document.createElement("div");
		flex.classList.add("flex-container");

		const save = createBtn({
			name: "save",
			title: this.text.tooltips.save,
			handler: this.saveChanges
		});

		const bold = createBtn({
			name: "bold",
			title: this.text.tooltips.bold,
			handler: this.makeBold
		});

		const italic = createBtn({
			name: "italic",
			title: this.text.tooltips.italic,
			handler: this.makeItalic
		});

		const drag = createBtn({
			name: "drag",
			title: this.text.tooltips.drag,
			handler: this.dragToolbar
		});

		const underline = createBtn({
			name: "underline",
			title: this.text.tooltips.underline,
			handler: this.makeUnderlined
		});

		const linethrough = createBtn({
			name: "linethrough",
			title: this.text.tooltips.linethrough,
			handler: this.makeLinethrough
		});

		const link = createBtn({
			name: "link",
			title: this.text.tooltips.link,
			handler: this.insertLink
		});

		flex.appendChild(drag);
		flex.appendChild(bold);
		flex.appendChild(italic);
		flex.appendChild(underline);
		flex.appendChild(linethrough);
		flex.appendChild(link);
		flex.appendChild(save);
		toolbar.appendChild(flex);
		document.body.appendChild(toolbar);

		this.toolbar = toolbar;
	}

	findSectionByPath(path){
		const sections = this.sections;
		let result = null;

		for(let section of sections)
			if(section.path === path)
				result = section;

		return result;
	}

	onKeydown(e){
		const key = e.keyCode;
		const target = e.target;
		const tagName = target.localName;

		// If user pressed escape, cancel the edit.
		if(key === 27){
			removeInput();
			this.removeListeners();
		}

		// If the user is holding the shift key, don't confirm the change.
		// Use the default action instead, which is creating a new line.
		if(key === 13 && e.shiftKey){
			// But if the active element is a list, create a new list item instead of a new line.
			if(tagName === "ul" || tagName === "ol"){
				e.preventDefault();
				const li = document.createElement("li");
				const numOfItems = target.querySelectorAll("li").length + 1;

				li.innerText = this.text.elements.li + " " + numOfItems;
				target.appendChild(li);
				li.focus();
			}

			return;
		}

		if(key === 13){
			e.preventDefault();
			this.confirmChange(e);
		}
	}

	updateChanges(path, value){
		const section = this.findSectionByPath(path);

		section.edited_text = value;
	}

	confirmChange(e){
		const target = e.target;
		const path = getSelectorPath(target);

		this.updateChanges(path);
		removeInput();
	}

	edit(e){
		let el = e.target,
			i = 0;

		const childTags = ["li", "b", "i", "span", "u", "strike", "a"];
		const path = getSelectorPath(el).split(" ");
		const elements = path.map( (item) => {
			const tagName = item.split(".")[0].split("#")[0];

			return tagName;
		}).filter( (value) => {
			if(this.tags.indexOf(value) !== -1)
				return true;
			else
				return false;
		});
		const containsEditableTags = elements.length > 0;

		if(el.localName === "a"){
			e.stopImmediatePropagation();
			e.preventDefault();
		}

		if(!containsEditableTags)
			return;

		while(childTags.indexOf(el.localName) !== -1){
			// Cancel after 40 iterations to avoid infinite loops.
			if(i >= 40) break;

			if(elements.indexOf(el.localName) !== -1 && childTags.indexOf(el.localName) === -1)
				break;

			if(elements.indexOf(el.parentNode.localName) !== -1)
				el = el.parentNode;

			i += 1;
		}

		el.setAttribute("contenteditable", "true");
		el.setAttribute("spellcheck", "false");
		el.setAttribute("autocomplete", "off");
		el.setAttribute("autocapitalize", "off");
		el.setAttribute("autocorrect", "off");
		el.classList.add("cms-input-field");
		el.focus();

		document.addEventListener("mousedown", handleAbort, { once: true });
	}

	saveChanges(){
		console.log("saved");
	}

	dragToolbar(e){
		const el = e.target;
		const toolbar = el.parentNode.parentNode;

		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", removeListeners);
		el.addEventListener("blur", removeListeners);

		function move(e){
			const mouseX = e.clientX;
			const mouseY = e.clientY;
			const offsetX = el.clientWidth / 2;
			const offsetY = toolbar.clientHeight / 2;

			const posX = mouseX - offsetX;
			const posY = mouseY - offsetY;

			const minX = 0;
			const maxX = window.innerWidth - (toolbar.clientWidth + 3);
			const minY = 0;
			const maxY = window.innerHeight - (toolbar.clientHeight + 3);

			if(posX > minX && posX < maxX)
				toolbar.style.left = posX + "px";

			if(posY > minY && posY < maxY)
				toolbar.style.top = posY + "px";
		}

		function removeListeners(){
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", removeListeners);
			el.removeEventListener("blur", removeListeners);
		}
	}

	makeBold(){
		document.execCommand("bold");
	}

	makeItalic(){
		document.execCommand("italic");
	}

	makeUnderlined(){
		document.execCommand("underline");
	}

	makeLinethrough(){
		document.execCommand("strikeThrough");
	}

	async insertLink(e){
		e.preventDefault();

		document.execCommand("backColor", false, "#ccc");

		const selection = window.getSelection();
		const extentOffset = selection.extentOffset;
		const baseOffset = selection.baseOffset;
		const focusNode = selection.focusNode;
		const startIndex = extentOffset < baseOffset ? extentOffset : baseOffset;
		const endIndex = extentOffset < baseOffset ? baseOffset : extentOffset;
		const range = document.createRange();
		const link = await promptUser("Link");

		range.setStart(focusNode, startIndex);
		range.setEnd(focusNode, endIndex);
		selection.removeAllRanges();
		selection.addRange(range);

		document.execCommand("backColor", false, "transparent");
		document.execCommand("createLink", false, link);
	}
}

async function promptUser(msg){
	return new Promise( resolve => {
		const promptContainer = document.createElement("div");
		promptContainer.classList.add("prompt-container");

		const promptMsg = document.createElement("h4");
		promptMsg.innerText = msg;

		const promptInput = document.createElement("div");
		promptInput.setAttribute("contenteditable", "true");
		promptInput.classList.add("prompt-input");
		promptInput.addEventListener("keydown", submitPrompt);

		promptContainer.appendChild(promptMsg);
		promptContainer.appendChild(promptInput);

		document.body.appendChild(promptContainer);

		function submitPrompt(e){
			const target = e.target;
			const key = e.keyCode;
			const value = target.innerText;

			if(key === 13){
				e.preventDefault();
				document.body.removeChild(promptContainer);

				resolve(value);
			}
		}
	});
}

function createBtn({ name, handler, title }){
	const btn = document.createElement("div");
	btn.setAttribute("title", title);
	btn.classList.add("cms-" + name);
	btn.classList.add("cms-btn");
	btn.addEventListener("mousedown", handler);

	return btn;
}

function getSelectorPath(el){
	const top = "body";
	let path = getSelector(el),
		parent = el.parentNode,
		i = 0;

	if(el.localName === "html") return;
	if(!parent) return;

	while(parent.localName !== top){
		let selector = path;

		selector += getSelector(parent);

		parent = parent.parentNode;
		path = selector;

		// Safety measure to prevent infinite loop.
		if(i > 50)
			break;

		i += 1;
	}

	return reverseStr(path, " ").trim();
}

function getSelector(el){
	if(!el) return;

	let selector = el.localName;

	if(!selector) return;

	if(el.id)
		selector += "#" + el.id;
	else if(el.classList.length > 0 && !el.classList.contains("cms-input-field"))
		selector += "." + el.className.split(" ").join(".");

	return selector + " ";
}

function reverseStr(str, sep){
	const list = str.split(sep);
	const result = list.reverse().join(sep);

	return result;
}

function removeInput(){
	const inputs = document.querySelectorAll(".cms-input-field");

	for(let input of inputs){
		input.removeAttribute("contenteditable");
		input.classList.remove("cms-input-field");
		input.removeEventListener("mousedown", handleAbort);
	}
}

function handleAbort(e){
	const target = e.target.localName !== "li" ? e.target : e.target.parentNode;

	if(shouldAbort(target))
		removeInput();
}

function shouldAbort(target){
	const should = !target.classList.contains("cms-input-field") &&
					!target.classList.contains("cms-btn") &&
					!target.classList.contains("prompt-container") &&
					!target.classList.contains("prompt-input");

	return should;
}

export default CMS;
