(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingHomeworkActions = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const accepted = new Set(['saveMixedDraft', 'publishMixed', 'reviewMixed', 'assessMixed']);
  const rejected = new Set(['INVALID','FORBIDDEN','UNAUTHORIZED','NOT_FOUND','CONFLICT','CAPACITY','DATA_INVALID','RATE_LIMITED']);
  function create(options) {
    let busy = false;
    const key = (scope,courseId) => 'gb_hw_pending_v1_' + scope + '_' + courseId;
    const read = (scope,courseId) => { const raw=options.storage.getItem(key(scope,courseId)); return raw ? JSON.parse(raw) : null; };
    async function send(scope, pending, retrying) {
      if (await options.scope() !== scope) throw new Error('教师连接已变化，请重新连接');
      try {
        const result=await options.request(pending,scope);
        if (!result || !Number.isInteger(result.revision)) throw new Error('云端响应未确认版本');
        options.storage.removeItem(key(scope,pending.courseId));
        return result;
      } catch(error) {
        if (!retrying && rejected.has(error.code)) options.storage.removeItem(key(scope,pending.courseId));
        else { error.message='请求结果尚未确认，请核对或重试同一请求：'+error.message; error.pending=true; }
        throw error;
      }
    }
    async function locked(fn) { if(busy) throw new Error('操作正在处理，请勿重复提交'); busy=true; try{return await fn();}finally{busy=false;} }
    return {
      async pending(courseId) { const scope=await options.scope(); return read(scope,courseId); },
      async submit(input) { return locked(async()=>{
        if (!input || !accepted.has(input.action) || !input.courseId) throw new Error('作业请求无效');
        const scope=await options.scope();
        if(read(scope,input.courseId)) throw new Error('该课程有结果待确认的请求，请先重试核对');
        const pending={...input,requestId:options.id()};
        options.storage.setItem(key(scope,input.courseId),JSON.stringify(pending));
        return send(scope,pending,false);
      }); },
      async retry(courseId) { return locked(async()=>{
        const scope=await options.scope(), pending=read(scope,courseId);
        if(!pending || pending.courseId!==courseId || !accepted.has(pending.action) || !pending.requestId) throw new Error('没有可重试的作业请求');
        return send(scope,pending,true);
      }); }
    };
  }
  return {create};
}));
