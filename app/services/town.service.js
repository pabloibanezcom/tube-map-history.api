const service = {};
const getTown = require('../util/getTown');
const verifyRoles = require('../auth/role-verification');
const addCreatedAndModified = require('../util/addCreatedAndModified');
const transformMongooseErrors = require('../util/transformMongooseErrors');

service.getTownInfo = async (modelsService, townIdOrName) => {
  const town = await getTown(modelsService, townIdOrName, false, [{ path: 'users', select: 'user role', populate: { path: 'user', select: 'firstName lastName' } }]);
  if (!town) {

    return { statusCode: 404, data: 'Town not found' };
  }
  return { statusCode: 200, data: town };
}

service.getTowns = async (modelsService) => {
  const towns = await modelsService.getModel('Town').find({})
    .populate({ path: 'country', select: 'name code continent' })
    .select('name country url alias year');
  return { statusCode: 200, data: towns };
}

service.addTown = async (modelsService, user, townObj) => {
  if (!verifyRoles(['A'], user)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }

  const Town = modelsService.getModel('Town');

  const existingTownWithUrl = await Town.findOne({ url: townObj.url });
  if (existingTownWithUrl) {
    return { statusCode: 400, data: 'URL already defined in other town' };
  }

  const town = new Town(addCreatedAndModified({ ...townObj }, user, true));

  try {
    const doc = await town.save();
    return { statusCode: 200, data: doc };
  }
  catch (err) {
    return { statusCode: 400, data: transformMongooseErrors(err) };
  }
}

service.updateTown = async (modelsService, user, townId, townObj) => {
  const town = await modelsService.getModel('Town').findOne({ _id: townId });
  if (!verifyRoles(['A'], user)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }

  Object.assign(town, addCreatedAndModified(townObj, user, false));

  try {
    await town.save();
    return { statusCode: 200, data: town };
  }
  catch (err) {
    return { statusCode: 400, data: transformMongooseErrors(err) };
  }
}

service.deleteTown = async (modelsService, user, townId) => {
  const town = await modelsService.getModel('Town').findOne({ _id: townId });
  if (!verifyRoles(['A'], user, null, town)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }

  try {
    await town.remove();
    return { statusCode: 200, data: `${town.name} was removed` };
  }
  catch (err) {
    return { statusCode: 400, data: transformMongooseErrors(err) };
  }
}

module.exports = service;