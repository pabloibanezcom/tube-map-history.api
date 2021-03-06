const paginateResults = require('../util/paginateResults');
const verifyRoles = require('../auth/role-verification');
const transformMongooseErrors = require('../util/transformMongooseErrors');
const addCreatedAndModified = require('../util/addCreatedAndModified');
const validatePagination = require('../util/validatePagination');
const service = {};

// service.getStationsByYearRange = async (modelsService, townIdOrName, yearTo, yearFrom) => {
//   const townId = await getTown(modelsService, townIdOrName);
//   if (!townId) {
//     return { statusCode: 404, data: 'Town not found' };
//   }
//   const yearFromQuery = yearFrom ? { $gt: parseInt(yearFrom) - 1 } : null;
//   const stations = await modelsService.getModel('Station')
//     .find({ town: townId, year: { ...yearFromQuery, $lt: parseInt(yearTo) + 1 }, connections: { $exists: true, $ne: [] } });
//   return { statusCode: 200, data: stations };
// }

service.searchStations = async (modelsService, user, draftId, body) => {
  if (!verifyRoles(['U', 'A'], user)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }
  if (!validatePagination(body.pagination)) {
    return { statusCode: 400, data: 'Bad request: Pagination is wrong format' };
  }

  const searchParams = {
    filter: {
      draft: draftId
    },
    sort: body.sort || '',
    select: body.select || '',
    populate: body.populate || ''
  };
  if (body.filter && body.filter._id) {
    searchParams.filter._id = body.filter._id;
  }
  if (body.filter && body.filter.name) {
    searchParams.filter.name = { $regex: body.filter.name, $options: 'i' };
  }
  if (body.filter && body.filter.year) {
    searchParams.filter.year = { $gte: body.filter.year.min, $lte: body.filter.year.max };
  }
  if (body.filter && body.filter.line) {
    searchParams.filter.connections = { $exists: true, $not: { $size: 0 } };
  }
  let stations = await modelsService.getModel('Station')
    .find(searchParams.filter)
    .sort(searchParams.sort)
    .select(searchParams.select)
    .populate(searchParams.populate);
  if (body.filter && body.filter.numberLines) {
    stations = stations.filter(st => {
      const lines = [];
      st.connections.map(c => {
        if (!lines.includes(c.line.id)) {
          lines.push(c.line.id);
        }
      });
      return lines.length >= body.filter.numberLines.min && lines.length <= body.filter.numberLines.max;
    });
  }
  if (body.filter && body.filter.line) {
    stations = stations.filter(st => st.connections.some(c => c.line.equals(body.filter.line)));
  }
  return { statusCode: 200, data: paginateResults(stations, body.pagination) };
}

service.getStationFullInfo = async (modelsService, user, stationId) => {
  if (!verifyRoles(['U', 'A'], user)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }
  const station = await modelsService.getModel('Station')
    .findById(stationId)
    .populate({
      path: 'connections', populate: [{ path: 'stations', select: 'name year markerColor' },
      { path: 'line', select: 'name shortName colour fontColour' }]
    });
  if (!station) {
    return { statusCode: 404, data: 'Station not found' };
  }
  // Remove self station from connections stations
  for (const c of station.connections) {
    c.stations = c.stations.filter(s => s.id !== stationId);
  }
  return { statusCode: 200, data: station };
}

service.addStation = async (modelsService, user, draftId, stationObj) => {
  if (!verifyRoles(['M', 'A'], user, draftId)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }

  const draft = await modelsService.getModel('Draft').findOne({ _id: draftId });
  if (!draft) {
    return { statusCode: 404, data: 'Draft does not exist' };
  }

  if (draft.isPublished) {
    return { statusCode: 403, data: 'Draft can not be updated as it is published' };
  }

  const Station = modelsService.getModel('Station');
  const station = new Station(addCreatedAndModified({ ...stationObj, draft: draftId, markerColor: '#ffffff' }, user, true));

  try {
    await station.save();
  }
  catch (err) {
    return { statusCode: 400, data: transformMongooseErrors(err) };
  }

  // Add station ref to draft
  draft.stations.push(station._id);
  await draft.save();

  return { statusCode: 200, data: station };
}

service.updateStation = async (modelsService, user, stationId, stationObj) => {
  const station = await modelsService.getModel('Station').findOne({ _id: stationId }).populate({ path: 'draft', select: 'isPublished' });
  if (!station) {
    return { statusCode: 404, data: 'Station does not exist' };
  }

  if (!verifyRoles(['M', 'A'], user, station.draft._id)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }

  Object.assign(station, addCreatedAndModified(stationObj, user, false));

  try {
    await station.save();
    return { statusCode: 200, data: station };
  }
  catch (err) {
    return { statusCode: 400, data: transformMongooseErrors(err) };
  }
}

service.deleteStation = async (modelsService, user, stationId) => {
  const station = await modelsService.getModel('Station').findOne({ _id: stationId });
  if (!station) {
    return { statusCode: 404, data: 'Station does not exist' };
  }

  const draft = await modelsService.getModel('Draft').findOne({ _id: station.draft });

  if (!verifyRoles(['M', 'A'], user, draft._id)) {
    return { statusCode: 401, data: 'Unauthorized' };
  }

  try {
    await station.remove();
  }
  catch (err) {
    return { statusCode: 400, data: transformMongooseErrors(err) };
  }

  // Remove station ref from draft
  draft.stations = draft.stations.filter(s => !s.equals(station._id));
  await draft.save();

  return { statusCode: 200, data: `${station.name} was removed` };
}

module.exports = service;