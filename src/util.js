'use strict'
/* globals Promise */
/*
 * Copyright (C) 2016 TopCoder Inc., All Rights Reserved.
 */
/**
 * This is utils file.
 * @author TCDEVELOPER
 * @version 1.0
 */


import _ from 'lodash'
import querystring from 'querystring'
import config from 'config'

let util = _.cloneDeep(require('tc-core-library-js').util(config))
_.assignIn(util, {
  /**
   * Handle error
   * @param defaultMessage the default error message
   * @param err the err
   * @param next the next function
   * @returns next function with error
   */
  handleError: (msg, err, req, next) => {
    req.log.error({
      message: msg,
      error: err
    })
    let apiErr = new Error(msg)
    _.assign(apiErr, {
      status: _.get(err, 'status', 500),
      details: _.get(err, 'details', msg)
    })
    return next(apiErr)
  },
  /**
   * Validates if filters are valid
   * @param  {object} filters    object with filters
   * @param  {array} validValues valid filter values
   * @return {boolean}
   */
  isValidFilter: (filters, validValues) => {
    var valid = true
    _.each(_.keys(filters), (k) => {
      if (valid && _.indexOf(validValues, k) < 0) {
        valid = false
      }
    })
    return valid
  },
  /**
   * Helper funtion to verify if user has specified role
   * @param  {object} req  Request object that should contain authUser
   * @param  {string} role specified role
   * @return {boolean}      true/false
   */
  hasRole: (req, role) => {
    let roles = _.get(req, 'authUser.roles', [])
    roles = roles.map(s => s.toLowerCase())
    return _.indexOf(roles, role.toLowerCase()) >= 0
  },

  /**
   * Parses query fields and groups them per table
   * @param  {array} queryFields list of query fields
   * @return {object}
   */
  parseFields: (queryFields, allowedFields) => {
    var fields = _.cloneDeep(allowedFields)
    if (queryFields.length) {
      // remove any inavlid fields
      fields['projects'] = _.intersection(queryFields, allowedFields['projects'])
      fields['project_members'] = _.filter(queryFields, (f) => { return f.indexOf('members.') === 0})
      // remove members. prefix
      fields['project_members'] = _.map(fields['project_members'], (f) => { return f.substring(8) })
      // remove any errorneous fields
      fields['project_members'] = _.intersection(fields['project_members'], allowedFields['project_members'])
      if (fields['project_members'].length === 0 && _.indexOf(queryFields, 'members') > -1) {
        fields['project_members'] = allowedFields['project_members']
      }
    }
    return fields
  },

  /**
   * [description]
   * @param  {[type]} queryFilter [description]
   * @return {[type]}             [description]
   */
  parseQueryFilter: (queryFilter) => {
    queryFilter = querystring.parse(queryFilter)
    // convert in to array
    queryFilter = _.mapValues(queryFilter, (val) => {
      if (val.indexOf('in(') > -1) {
        return { $in: val.substring(3, val.length-1).split(',') }
      }
      return val
    })
    if (queryFilter.id) {
      queryFilter.id['$in'] = _.map(queryFilter.id['$in'], _.parseInt)
    }
    return queryFilter
  },

  /**
   * Moves file from source to destination
   * @param  {object} req    request object
   * @param  {object} source source object
   * @param  {string} dest   destination url
   * @return {promise}       promise
   */
  s3FileTransfer: (req, source, dest) => {
    return new Promise((resolve, reject) => {
      var cmdStr = _.join([
        'aws s3 mv',
        source,
        dest,
        '--region us-east-1'
      ], ' ')

      const exec = require('child_process').exec
      exec(cmdStr, (error, stdout, stderr) => {
        req.log.debug(`s3FileTransfer: stdout: ${stdout}`)
        req.log.debug(`s3FileTransfer: stderr: ${stderr}`)
        if (error !== null) {
          req.log.error(`exec error: ${error}`)
          return reject(error)
        }
        return resolve({success: true})
      })
    })
  },


  /**
   * retrieve download urls for all attachments
   * @param  {[type]} req         original request
   * @param  {[type]} attachments list of attachments to retrieve urls for
   * @return {[type]}             [description]
   */
  getFileDownloadUrl: (req, filePath) => {
    if (!filePath) {
      return Promise.reject( new Error('file path empty'))
    }
    let fileServiceUrl = config.get('fileServiceEndpoint')
    if (fileServiceUrl.substr(-1) !== '/') fileServiceUrl += '/'
    // get presigned Url
    var httpClient = util.getHttpClient(req)
    httpClient.defaults.headers.common['Authorization'] = req.headers.authorization
    return httpClient.post(fileServiceUrl + 'downloadurl', {
        param: {
          filePath: filePath
        }
      })
      .then((resp) => {
        req.log.debug('Retreiving Presigned Url resp: ', JSON.stringify(resp.data, null, 2))
        if (resp.status !== 200 || resp.data.result.status !== 200) {
          return Promise.reject(new Error("Unable to fetch pre-signed url"))
        }
        return [
          filePath,
          resp.data.result.content.preSignedURL
        ]
      })
    }
})

export default util
