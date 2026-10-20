"""Explicit API capability mocks for regressions that exercise POST paths.

No real credentials or paid provider requests are used. With no post_handler,
POST falls through to the offline local server and fails honestly.
"""
import json

def reveal(page, selector):
    """Open native disclosure ancestors through their visible summary controls."""
    target = page.locator(selector).first if isinstance(selector, str) else selector.first
    for disclosure in target.locator('xpath=ancestor::details[not(@open)]').all():
        disclosure.locator(':scope > summary').click()
    return target

def memo_entry(page):
    """Use the public writing entry; legacy/standalone forms stay directly visible."""
    memo = page.locator('#memo')
    if not memo.is_visible():
        entry = page.locator('[data-start=memo]')
        if entry.count():
            entry.click()
        else:
            reveal(page, '#memo')
    return memo

def close_student_detail(page):
    """Close the mobile detail drawer using its documented return action."""
    action = page.locator('#node-detail [data-tree-go=tree-container]')
    if action.count() and action.is_visible():
        action.click()

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
