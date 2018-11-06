require("array-last-item");
const isSeq = ast => ast && ast.$name === "";
const makeCall = (name = "", args = []) => ({$name: name, $args: args});
const makeQuot = (args = []) => ({$args: args});
const makeSeq = args => makeCall("", args);
const occurrenceRe = /m?any|maybe|one/;
const occurenceMap = {
	"one": 1,
	"maybe": 2,
	"any": 3,
	"many": 4,
};

//FIXME
//const unwrapIfSeq = value => isSeq(value) ? value.$args[0] : value;

// TODO:
// - add 'appender' body to export to do the insertion of the call
// - provide core functions as a module (how to type?)
// - provide constraints in normalize
const mongoConverters = {
	where(args, convert) {
		if(args.length != 2) throw "Incorrect length";
		return {
			[args.slice(0,1)]: convert(makeSeq(args.slice(1)))
		};
	}
};

function dashedToCamelCase(str) {
	return str.split(/-/g).map(function (_, i) {
		return i > 0 ? _.charAt(0).toUpperCase() + _.substr(1) : _;
	}).join("");
}

class Builder {
	constructor(prefix = "local", modules = {}, exports = {}, exportsByType = {}) {
		// TODO bind to prefix, normalize qname, support imports
		this.$prefix = prefix;
		this.$modules = modules;
		this.$exports = exports;
		this.$exportsByType = exportsByType;
		// defaults
		this.$root = makeSeq();
		this.$insert = this.$root.$args;
		this.$ancestors = [];
		this.$ancestorProps = new WeakMap();
	}
	$new(root, insert, ancestors, ancestorProps) {
		const cx = new Builder(this.$prefix, this.$modules, this.$exports, this.$exportsByType);
		if(root) cx.$root = root;
		if(insert) cx.$insert = insert;
		if(ancestors) cx.$ancestors = ancestors;
		if(ancestorProps) cx.$ancestorProps = ancestorProps;
		return cx;
	}
	/**
	 * exposes functions based on type and rules
	 * @param  {[type]} type [description]
	 * @param  {[type]} rules [description]
	 * @return {[type]}         [description]
	 */
	$exposeBy(type, ancestorIndex) {
		// TODO parse rules
		// find by exact return type
		let exports = this.$exportsByType[JSON.stringify(type)] || [];
		// try occurrence
		const hasOcc = occurrenceRe.test(type.$name);
		if(hasOcc) {
			const occExports = this.$exportsByType[JSON.stringify(type.$args[0])];
			exports = occExports ? exports.concat(occExports) : exports;
			const occurence = occurenceMap[type.$name];
			if(occurence === 2 || occurence === 3) {
				const emptyExports = this.$exportsByType[JSON.stringify(makeSeq())];
				exports = emptyExports ? exports.concat(emptyExports) : exports;
			}
		}
		for(const exprt of exports) {
			this.$expose(exprt, ancestorIndex);
		}
		return this;
	}
	$normalize(exprt, paramType, expr) {
		if(typeof expr == "function") {
			expr = expr(this.$new().$exposeBy(paramType));
		}
		if(expr instanceof Builder) {
			expr = expr.$ast;
		}
		return expr;
	}
	$append(arg) {
		this.$insert.push(arg);
		return this;
	}
	$appendCall(name, args) {
		return this.$append(makeCall(name,args));
	}
	$appendQuot(args) {
		return this.$append(makeQuot(args));
	}
	$checkPartials(ancestorIndex) {
		if(ancestorIndex) {
			let i = this.$ancestors.length;
			const { insert } = this.$ancestorProps.get(this.$ancestors[ancestorIndex - 1]);
			this.$insert = insert;
			for(; i > ancestorIndex; --i) {
				const ancestor = this.$ancestors.pop();
				this.$ancestorProps.delete(ancestor);
			}
		}
	}
	seq(up = 0) {
		// move insert to next arg
		const ancestorLen = this.$ancestors.length;
		if(ancestorLen && ancestorLen - up > 1) {
			const at = ancestorLen - 1 - up;
			const removed = this.$ancestors.splice(at + 1);
			removed.forEach(anc => {
				this.$completeAndRemove(anc);
			});
			const ancestor = this.$ancestors[at];
			const name = ancestor.$name;
			const exports = this.$exports[name];
			const len = +Object.keys(exports).lastItem;
			const args = ancestor.$args;
			if(args.length < len) {
				const { curParamType } = this.$ancestorProps.get(ancestor);
				args.push(makeSeq());
				this.$insert = args.lastItem.$args;
				this.$ancestorProps.set(ancestor, {insert: this.$insert, curParamType});
				// remove after me
				return this.$new(this.$root, this.$insert, this.$ancestors, this.$ancestorProps).$exposeBy(curParamType);
			} else {
				// used to explicitly complete a function
				return this.seq(1);
			}
		}
		return this;
	}
	$completeAndRemove(ancestor) {
		const args = ancestor.$args;
		const index = args.length;
		const name = ancestor.$name;
		const exports = this.$exports[name];
		const len = +Object.keys(exports).lastItem;
		if(index === len) {
			this.$checkBinds(name, args);
		}
		this.$ancestorProps.delete(ancestor);
	}
	$cleanupAncestors() {
		const removed = this.$ancestors.splice(0);
		removed.reverse().forEach(anc => {
			this.$completeAndRemove(anc);
		});
		return this;
	}
	$export(name, type) {
		// we want to export core functionality first
		// what we need is just import/export/var as core and quot as separate thing
		// exposes the required functions
		// TODO use typedef to detect quot
		if(isSeq(type)) {
			type = type.$args[0];
		}
		const paramTypes = isSeq(type.$args[0]) ? type.$args[0].$args : [type.$args[0]];
		const len = paramTypes.length;
		if(!this.$exports[name]) this.$exports[name] = {};
		this.$exports[name][len] = type;
		const retType = isSeq(type.$args[1]) ? type.$args[1].$args[0] : type.$args[1];
		// TODO l3
		//const retTypeStr = l3.toVNodeStream(l3.ensureDoc(retType))
		const retTypeStr = JSON.stringify(retType);
		if(!this.$exportsByType[retTypeStr]) {
			this.$exportsByType[retTypeStr] = [];
		}
		this.$exportsByType[retTypeStr].push(name+"#"+len);
		return this;
	}
	$checkBinds(name, args) {
		if (name === "export") {
			this.$export(...args);
		//} else if (name === "import") {
		//} else if (name === "$") {
		}
	}
	$expose(exprt, ancestorIndex) {
		// TODO detect when a function is 'completed' before checkbinds and exposeBy
		// TODO VNode + detect type + private
		// TODO js name to qname
		// TODO handle seqs
		// actually we don't want to bind it to 'this' yet
		// we want to bind it to the active module (by prefix)
		// we only want to expose on the following step
		// furthermore we want to enable param-by-param versions
		// this fills in each param by calling 'seq', starting with second
		// functions should only be checked for length after last seq call
		// export writes to module context,
		// only after creating context for a module will functions be exposed...
		const [qname, len] = exprt.split("#");
		const type = this.$exports[qname][len];
		const name = dashedToCamelCase(qname);
		const paramTypes = isSeq(type.$args[0]) ? type.$args[0].$args : [type.$args[0]];
		//const returnType = isSeq(type.$args[1]) ? type.$args[1].$args[0] : type.$args[1];
		const lastParamType = paramTypes.lastItem;
		const lastParamTypeName = lastParamType ? lastParamType.$name : null;
		const hasRestParams = lastParamTypeName && lastParamTypeName === "rest-params";
		if(!this[name]) {
			this[name] = (...args) => {
				this.$checkPartials(ancestorIndex);
				args = args.map((arg, idx) => this.$normalize(exprt, paramTypes[idx], arg));
				//if(!ref) throw new Error(`Incorrect number of parameters for ${name}, received ${args.length}, have ${len}`);
				this.$appendCall(qname, args);
				// set insert to inserted args
				// cancel when going up
				// TODO keep track of args filled in
				// last is a reference to AST of this call (i.e. self)
				const last = this.$insert.lastItem;
				let index = last ? last.$args.length : 0;
				index = hasRestParams ? Math.min(index, len - 2) : index;
				if(index < len || hasRestParams) {
					// NOTE that partials won't become full (so we have to call 'seq')
					const curParamType = paramTypes[index];
					this.$ancestors.push(last);
					this.$ancestorProps.set(last, {
						insert: this.$insert,
						curParamType: curParamType
					});
					const ref = makeSeq();
					last.$args.push(ref);
					// not finished = expose only allowed
					return this.$new(this.$root, ref.$args, this.$ancestors, this.$ancestorProps).$exposeBy(curParamType);
				}
				// some binds will not return args
				this.$checkBinds(qname, args);
				return this.$reExposeAncestors();
			};
		}
		return this;
	}
	$reExposeAncestors() {
		// finished = re-expose by ancestors (if have) on last saved param
		if(this.$ancestors.length) {
			let cx = this.$new(this.$root, this.$insert, this.$ancestors, this.$ancestorProps);
			this.$ancestors.forEach((ancestor, i) => {
				const { curParamType } = this.$ancestorProps.get(ancestor);
				cx = cx.$exposeBy(curParamType, i + 1);
			});
			return cx;
		} else {
			return this;
		}
	}
	$setDefaultPrefix(prefix) {
		this.$defaultPrefix = prefix;
		return this;
	}
	get $ast() {
		const root = this.$root;
		return root.$args.length === 1 ? root.$args[0] : root;
	}
	$mongo(converters = mongoConverters) {
		// TODO mixin
		const convert = (part) => {
			if(Array.isArray(part)) {
				return part.map(arg => convert(arg));
			}
			if(!part.$args) return part;
			// seq args to array, unless 'where'
			let qname = part.$name;
			let args = part.$args;
			if(qname === "") {
				return args.reduce((acc, arg) => Object.assign(acc, convert(arg)), {});
			}
			//const name2 = qname + "#" + args.length;
			if(converters.hasOwnProperty(qname)) {
				return converters[qname](args, convert);
			}
			return {
				["$"+qname]: args.length == 1 ? convert(args[0]) : convert(args)
			};
		};
		// TODO convert recursively
		return convert(this.$cleanupAncestors().$root);
	}
	$factory(top) {
		this.$cleanupAncestors();
		this.$root = makeSeq();
		this.$insert = this.$root.$args;
		return () => this.$expose(top);
	}
	get $typeDef() {
		return makeCall("$type-def");
	}
	get $qname() {
		return makeCall("$qname");
	}
}


// we need these types to begin with
// to be precise, we need to add rules that say types may appear under export
// and subtypes may appear under supertypes
// but the type calls themselves don't have types
const createCore = () => {
	// these basically belong to the grammar instead of types
	// types are allowed in specific situations (typedef)
	// core types are js-specific here and never take arguments
	// TODO extend object / array with more specific constraints (e.g. schema)
	const coreOccurrenceIndicators = ["any","many","maybe","one"];
	const coreTypes = ["atomic","string","number","boolean", "item", "object", "array"];
	const makeDef = (paramTypeSeq, returnType) => makeCall("function",[paramTypeSeq, returnType]);
	let $ = new Builder("core");
	// create generic type first
	// no use exposing export yet, because indicators + function won't be defined
	// these won't be in the AST...
	$ = coreOccurrenceIndicators.reduce(($, indicator) => $.$export(indicator, makeDef($.$typeDef, $.$typeDef)),$);
	$ = $.$export("function", makeDef(makeSeq([makeCall("any",[$.$typeDef]),$.$typeDef]), $.$typeDef))
		.$export("rest-params", makeDef(makeSeq(), $.$typeDef))
		.$export("export", makeDef(makeSeq([$.$qname, $.$typeDef]), makeSeq()));
	$ = coreTypes.reduce(($, type) => $.$export(type, makeDef(makeSeq(), $.$typeDef)),$);
	return $.$factory("export#2");
	// TODO expose must know exports
	// we can create import from AST
};

exports.core = createCore();

exports.Builder = Builder;
