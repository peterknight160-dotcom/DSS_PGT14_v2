const { expect } = require('chai');
const request = require('supertest');
//docker needs to be running for this test so it connects to db
describe('checking parameterised query against sql injection', () => {
    let app;
    before(() => {
        app = require('../app/app.js');
    });
    it('/password rejects injection via input validation', async () => {
        const injection = "' OR '1'='1'; DROP TABLE users;-- padding padding";
        const res = await request(app)
            .post('/password')
            .send({ 
                username_input: injection,
                password_input: 'somepassword' });
        expect(res.status).to.equal(400);
    })
})