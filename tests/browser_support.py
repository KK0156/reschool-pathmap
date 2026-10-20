"""Explicit API capability mocks for regressions that exercise POST paths.

No real credentials or paid provider requests are used. With no post_handler,
POST falls through to the offline local server and fails honestly.
"""
import json

class TreeApiMock:
    def __init__(self,page,configured=True):
        self.configured=configured
        self.post_handler=None
        self.posts=[]
        page.route('**/.netlify/functions/generate-tree',self.route)

    def route(self,route):
        if route.request.method=='GET':
            route.fulfill(status=200,content_type='application/json',body=json.dumps({'configured':self.configured}))
        elif route.request.method=='POST':
            self.posts.append(route.request.post_data_json)
            if self.post_handler:self.post_handler(route)
            else:route.fallback()
        else:
            route.fallback()
