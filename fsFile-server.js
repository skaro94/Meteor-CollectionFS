/**
 * Notes a details about a storage adapter failure within the file record
 * @param {string} storeName
 * @param {number} maxTries
 * @return {undefined}
 * @todo deprecate this
 */
FS.File.prototype.logCopyFailure = function(storeName, maxTries) {
  var self = this;

  // hasCopy will update from the fileRecord
  if (self.hasCopy(storeName)) {
    throw new Error("logCopyFailure: invalid storeName");
  }

  // Make sure we have a temporary file saved since we will be
  // trying the save again.
  FS.TempStore.ensureForFile(self);

  var now = new Date;
  var currentCount = (self.failures && self.failures.copies && self.failures.copies[storeName] && typeof self.failures.copies[storeName].count === "number") ? self.failures.copies[storeName].count : 0;
  maxTries = maxTries || 5;

  var modifier = {};
  modifier.$set = {};
  modifier.$set['failures.copies.' + storeName + '.lastAttempt'] = now;
  if (currentCount === 0) {
    modifier.$set['failures.copies.' + storeName + '.firstAttempt'] = now;
  }
  modifier.$set['failures.copies.' + storeName + '.count'] = currentCount + 1;
  modifier.$set['failures.copies.' + storeName + '.doneTrying'] = (currentCount + 1 >= maxTries);
  self.update(modifier);
};

/**
 * Has this store permanently failed?
 * @param {String} storeName The name of the store
 * @return {boolean} Has this store failed permanently?
 * @todo deprecate this
 */
FS.File.prototype.failedPermanently = function(storeName) {
  var self = this;
  return !!(self.failures
          && self.failures.copies
          && self.failures.copies[storeName]
          && self.failures.copies[storeName].doneTrying);
};

/**
 * @method FS.File.prototype.get
 * @public
 * @param {object} [options]
 * @param {string} [options.storeName] Name of the store to get from. If not
 * defined, the first store defined in `options.stores` for the
 * collection is used. So if there is only one store, you can generally omit
 * this, but if there are multiple, it's best to specify.
 * @param {number} [options.start] Start position
 * @param {number} [options.end] End position
 * @param {number} [options.format="binary"] Do you want "buffer" or "binary"?
 * @returns {Uint8Array|Buffer} The data
 * @todo can deprecate and use streams
 *
 * Returns the Buffer data from the requested store
 */
FS.File.prototype.get = function(options) {
  var self = this;
  // Make sure options are set
  options = options || {};
  // If we have defined a part of the file
  var partial = (typeof options.start === "number" && typeof options.end === "number");
  // On server we contact the storage adapter
  if (self.isMounted()) {

    var store = FS.StorageAdapter(options.storeName || '');
    if (!store) {
      // first store is considered the master store by default
      store = self.collection.options.stores[0];
    }

    var buffer;
    if (partial) {
      if (!(typeof store.getBytes === "function")) {
        throw new Error('FS.File.get: storage adapter for "' + options.storeName + '" does not support partial retrieval');
      }
      buffer = store.getBytes(self, options.start, options.end);
    } else {
      buffer = store.getBuffer(self);
    }

    if (options.format === "buffer") {
      return buffer;
    } else {
      return FS.Utility.bufferToBinary(buffer);
    }
  }
};

//TODO this might need some work
FS.File.prototype.createReadStream = function(storeName) {
  var self = this;
  // If we dont have a store name but got Buffer data?
  if (!storeName && self.data) {
    // Stream from attached data if present
    return self.data.createReadStream();

  } else if (!storeName && FS.TempStore && FS.TempStore.exists(self)) {
    // Stream from temp store - its a bit slower than regular streams?
    return FS.TempStore.createReadStream(self);

  } else {

    // Stream from the store using storage adapter
    if (self.isMounted()) {
      //
      var storage = self.collection.storesLookup[storeName] || self.collection.primaryStore;
      // return stream
      return storage.adapter.createReadStream(self);
    } else {
      throw new Meteor.Error('File not mounted');
    }

  }
};

//TODO this might need some work
FS.File.prototype.createWriteStream = function(storeName) {
  var self = this;

  // We have to have a mounted file in order for this to work
  if (self.isMounted()) {
    if (FS.TempStore && FS.FileWorker) {
      // If we have worker installed - we pass the file to FS.TempStore
      // We dont need the storeName since all stores will be generated from
      // TempStore.
      // This should trigger FS.FileWorker at some point?
      FS.TempStore.createWriteStream(self);
    } else {
      // Stream directly to the store using storage adapter
      var storage = self.collection.storesLookup[storeName] || self.collection.primaryStore;
      return storage.adapter.createWriteStream(self);
    }
  } else {
    throw new Meteor.Error('File not mounted');
  }
};
