'use strict'

import validate from 'express-validation'
import _ from 'lodash'
import Joi from 'joi'

import models from '../../models'
import util from '../../util'
import { middleware as tcMiddleware} from 'tc-core-library-js'

/**
 * API to add a project member.
 *
 */

const permissions = tcMiddleware.permissions

const addMemberValidations = {
  body: {
    param: Joi.object().keys({
      userId: Joi.number().required(),
      isPrimary: Joi.boolean(),
      role: Joi.any().valid('customer', 'manager', 'copilot').required()
    })
  }
}

module.exports = [
  // handles request validations
  validate(addMemberValidations),
  permissions('project.addMember'),
  (req, res, next) => {
    var member = req.body.param
    var projectId = _.parseInt(req.params.projectId)

    // set defaults
    _.assign(member, {
      projectId: projectId,
      createdBy: req.authUser.userId,
      updatedBy: req.authUser.userId
    })
    let members = req.context.currentProjectMembers

    // check if member is already registered
    let existingMember = _.find(members, (m) => {
      return m.userId === member.userId
    })
    if (existingMember) {
      let err = new Error('User already registered for role: ' + existingMember.role)
      err.status = 400
      return next(err)
    }
    // check if another member is registered for this role as primary,
    // if not mark this memmber as primary
    if (_.isUndefined(member.isPrimary)) {
      member.isPrimary = _.isUndefined(_.find(members, (m) => {
        return m.isPrimary && m.role === member.role
      }))
    }
    req.log.debug('creating member', member)
      // register member
    return models.ProjectMember.create(member)
      .then((newMember) => {
        // TODO fire event
        req.app.emit('internal.project.member-registered', newMember)
        res.status(201).json(util.wrapResponse(req.id, newMember))
      })
      .catch((err) => {
        req.log.error('Unable to register ', err)
        next(err)
      })

  }
]
