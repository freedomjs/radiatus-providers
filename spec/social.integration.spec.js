describe("social.radiatus.json", function() {
  var freedom;

  beforeEach(function(done) {
    done();
  });
  
  afterEach(function(done) {
    done();
  });

  it("test", function(done) {
    expect(true).toEqual(true);
    done();
  });
});

//describe("integration-single: social.radiatus.json", SOCIAL_SINGLE_INTEGRATION_SPEC.bind(this, "/src/providers/social.radiatus.json"));
describe("integration-double: social.radiatus.json", SOCIAL_DOUBLE_INTEGRATION_SPEC.bind(this, "/src/providers/social.radiatus.json"));
