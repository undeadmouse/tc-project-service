'use strict'

/**
 * API to handle retrieving a single project by id
 *
 * Permissions:
 * Only users that have access to the project can retrieve it.
 *
 */
var models = require('app/models'),
  validate = require('express-validation'),
  _ = require('lodash'),
  Joi = require('joi'),
  util = require('app/util'),
  permissions = require('tc-core-library-js').middleware.permissions

const PROJECT_ATTRIBUTES = _.keys(models.Project.rawAttributes)
const PROJECT_MEMBER_ATTRIBUTES = _.keys(models.ProjectMember.rawAttributes)

var _retrieveProjects = (req, criteria, fields) => {
  fields = fields ? fields.split(',') : []
    // parse the fields string to determine what fields are to be returned
  fields = util.parseFields(fields, {
    'projects': PROJECT_ATTRIBUTES,
    'project_members': PROJECT_MEMBER_ATTRIBUTES
  })
  return models.Project
    .findAndCountAll({
      logging: (str) => { req.log.debug(str)},
      where: criteria.filters,
      limit : criteria.limit,
      offset: criteria.offset,
      attributes: _.get(fields, 'projects', null),
      include: [{
        model: models.ProjectMember,
        as: 'members',
        attributes: _.get(fields, 'project_members', null)
      }]
    })
}
module.exports = [
  /**
   * GET projects/
   * Return a list of projects that match the criteria
   */
  (req, res, next) => {
    // handle filters
    var filters = util.parseQueryFilter(req.query.filter)
    var sort = req.query.sort ? decodeURIComponent(req.query.sort) : 'createdAt'
    if (sort && sort.indexOf(" ") == -1) {
      sort = sort + ' asc'
    }
    if (!util.isValidFilter(filters, ['id', 'status', 'type']) ||
      (sort && _.indexOf(['createdAt', 'createdAt asc', 'createdAt desc'], sort) < 0)) {
      util.handleError('Invalid filters or sort', null, req, next)
    }

    var criteria = {
      filters: filters,
      limit:  Math.min(req.query.limit || 20, 20),
      offset: req.query.offset || 0
    }
    req.log.debug(criteria)

    if (util.hasRole(req, req.app.locals.ROLES.TOPCODER_ADMIN)) {
      // admin has access to all projects
      
      return _retrieveProjects(req, criteria, req.query.fields)
        .then((result) => {
          return res.json(util.wrapResponse(req.id, result.rows, result.count))
        })
        .catch((err) => next(err))
    } else {
      // determine if user has access to the project being retreived
      return models.ProjectMember
        .getProjectIdsForUser(req.authUser.userId)
        .then((accessibleProjectIds) => {
          // filter based on accessible
          if (_.get(criteria.filters, 'id', null)) {
            criteria.filters.id['$in'] = _.intersection(accessibleProjectIds, criteria.filters.id['$in'])
          } else {
            criteria.filters.id = { $in : accessibleProjectIds}
          }
          return _retrieveProjects(req, criteria, req.query.fields)
        })
        .then((result) => {
          return res.json(util.wrapResponse(req.id, result.rows, result.count))
        })
        .catch((err) => next(err))
    }
  }
]