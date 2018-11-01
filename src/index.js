require("array-last-item");
const isSeq = ast => ast && ast.$name === "";
const makeCall = (name = "", args = []) => ({$name: name, $args: args});
const makeQuot = (args = []) => ({$args: args});
const makeSeq = args => makeCall("", args);

//FIXME
//const unwrapIfSeq = value => isSeq(value) ? value.$args[0] : value;

// TODO:
// - add 'appender' body to export to do the insertion of the call
// - provide core functions as a module (how to type?)
// - provide constraints in normalize
const mongoConverters = {
	where(args, convert) {
		console.log(JSON.stringify(args));
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
	constructor(prefix = "local", modules = {}, exports = {}, exportsByType = {}, ancestors = [], ancestorTypes = new WeakMap(), ancestorProps =  new WeakMap()) {
		this.$ancestors = ancestors;
		this.$ancestorProps = ancestorProps;
		this.$root = makeSeq();
		this.$insert = this.$root.$args;
		this.$modules = modules;
		this.$modulePrefix = prefix;
		this.$exports = exports;
		this.$exportsByType = exportsByType;
		this.$ancestorTypes = ancestorTypes;
	}
	$new(root, insert) {
		const cx = new Builder(this.$modulePrefix, this.$modules, this.$exports, this.$exportsByType, this.$ancestors, this.$ancestorTypes, this.$ancestorProps);
		if(root) cx.$root = root;
		if(insert) cx.$insert = insert;
		return cx;
	}
	/**
	 * exposes functions based on type and rules
	 * @param  {[type]} type [description]
	 * @param  {[type]} rules [description]
	 * @return {[type]}         [description]
	 */
	$exposeBy(type /*, rules*/) {
		// TODO parse rules
		// find by return type
		let exports = this.$exportsByType[JSON.stringify(type)];
		if(!exports) {
			// try occurrence
			if(type.$name === "any") {
				exports = this.$exportsByType[JSON.stringify(type.$args[0])];
			}
		}
		if(!exports) {
			console.log(type, "has no exports", JSON.stringify(type));
			//console.log(Object.keys(this.$exportsByType));
			exports = [];
		}
		//console.log(exposedByType, exports);
		for(const exprt of exports) {
			this.$expose(exprt, type);
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
	$checkPartials(exposedByType, returnType) {
		// if the types don't match, we may have a partial
		const retTypeStr = JSON.stringify(returnType);
		if(exposedByType && JSON.stringify(exposedByType) !== retTypeStr) {
			let match = false;
			if(exposedByType.$name === "any") {
				match = JSON.stringify(exposedByType.$args[0]) === retTypeStr;
			}
			if(!match) {
				// if this function's caller was ever partially applied
				// NOTE this is an early optimization, it would be passible to just iterate ancestors
				// exposedByType is a reference to the original caller
				// it should be on the last ancestor
				//if(this.$ancestorTypes.has(exposedByType)) {
				//const self = this.$ancestorTypes.get(exposedByType);
				// always remove parent: it may be readded
				// go up ancestors and expose popped again
				let i = this.$ancestors.length;
				if(i > 0) {
					for(; i > 0; --i) {
						const ancestor = this.$ancestors.pop();
						console.log("pop", ancestor);
						const { insert, curParamType } = this.$ancestorProps.get(ancestor);
						// check if these types match
						this.$completeAndRemove(ancestor);
						if(JSON.stringify(curParamType) === JSON.stringify(returnType)) {
							this.$insert = insert;
							match = true;
							break;
						}
					}
				} else {
					match = false;
				}
			}
			if(!match) {
				console.log(JSON.stringify(exposedByType), JSON.stringify(returnType));
				throw new TypeError("Types don't match and no ancestors");
			}
			//if(i < initlen) console.log(exprt, "removed up to",this.$ancestors[i]);
		}
	}
	seq(up = 0) {
		// move insert to next arg
		const ancestorLen = this.$ancestors.length;
		if(ancestorLen) {
			let at = ancestorLen - 1 - up;
			const ancestor = this.$ancestors[at];
			const name = ancestor.$name;
			const exports = this.$exports[name];
			const len = +Object.keys(exports).lastItem;
			const { curParamType } = this.$ancestorProps.get(ancestor);
			console.log("seq", JSON.stringify(ancestor));
			const args = ancestor.$args;
			if(args.length == len) {
				throw new Error("Received seq call for '"+name+"', but reached maximum number of arguments");
			}
			args.push(makeSeq());
			this.$insert = args.lastItem.$args;
			this.$ancestorProps.set(ancestor, {insert: this.$insert, curParamType});
			//this.$ancestorTypes.set(curParamType, true);
			// remove after me
			const removed = this.$ancestors.splice(at + 1);
			removed.forEach(anc => {
				this.$completeAndRemove(anc);
			});
			return this.$new().$exposeBy(curParamType);
		}
		return this.$append(makeSeq());
	}
	$cleanupAncestors() {
		const removed = this.$ancestors.splice(0);
		removed.reverse().forEach(anc => {
			this.$completeAndRemove(anc);
		});
		return this;
	}
	$completeAndRemove(ancestor) {
		const args = ancestor.$args;
		const index = args.length;
		const name = ancestor.$name;
		const exports = this.$exports[name];
		const len = +Object.keys(exports).lastItem;
		if(index == len) {
			console.log(name, "completed", args);
			this.$checkBinds(name, args);
		}
		console.log(name, "removed", index, len);
		this.$ancestorProps.delete(ancestor);
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
	$expose(exprt, exposedBy) {
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
		const returnType = isSeq(type.$args[1]) ? type.$args[1].$args[0] : type.$args[1];
		const lastParamType = paramTypes.lastItem;
		const lastParamTypeName = lastParamType ? lastParamType.$name : null;
		const hasRestParams = lastParamTypeName && lastParamTypeName === "rest-params";
		if(!this[name]) {
			this[name] = (...args) => {
				console.log("call",qname,exprt);
				this.$checkPartials(exposedBy, returnType);
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
					console.log("open", qname, len, index);
					this.$ancestors.push(last);
					this.$ancestorProps.set(last, {
						insert: this.$insert,
						curParamType: curParamType
					});
					//this.$ancestorTypes.set(curParamType, true);
					const ref = makeSeq();
					last.$args.push(ref);
					// not finished = expose only allowed
					return this.$new(this.$root, ref.$args).$exposeBy(curParamType);
				}
				// some binds will not return args
				this.$checkBinds(qname, args);
				// finished = re-expose by ancestors (if have) on last param
				if(this.$ancestors.length) {
					let cx = this.$new(this.$root, this.$insert);
					this.$ancestors.forEach(ancestor => {
						const { curParamType } = this.$ancestorProps.get(ancestor);
						//console.log("re-expose",ancestor,curParamType);
						cx = cx.$exposeBy(curParamType);
					});
					return cx;
				}
				return this;
			};
		}
		return this;
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
				console.log(part);
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
		console.log("mnogo");
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
